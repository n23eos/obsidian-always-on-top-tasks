import { beforeEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/notify", () => ({ notify: vi.fn() }));

import { TimerService } from "../src/TimerService";
import type { RunningTimer } from "../src/core/timer";
import type { PersistedBreak } from "../src/core/breakLine";
import { notify } from "../src/notify";

const START = 1_000_000;
const TASK = "- [ ] First task";

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

interface HarnessOptions {
  timer?: RunningTimer | null;
  breakTimer?: PersistedBreak | null;
  focusNotePath?: string;
  content?: string;
  fileByPath?: (path: string) => { path: string; extension: string } | null;
  process?: (
    update: (content: string) => string,
    write: (content: string) => void,
  ) => Promise<void>;
  patch?: (timer: RunningTimer | null) => Promise<void>;
  patchSettings?: (patch: {
    focusNotePath?: string;
    runningTimer?: RunningTimer | null;
    breakTimer?: PersistedBreak | null;
  }) => Promise<void>;
}

function createHarness(options: HarnessOptions = {}) {
  let content = options.content ?? TASK;
  const file = { path: "focus.md", extension: "md" };
  const process = vi.fn(async (_file: typeof file, update: (current: string) => string) => {
    if (options.process) {
      await options.process(update, (next) => {
        content = next;
      });
      return;
    }
    content = update(content);
  });
  const plugin = {
    settings: {
      focusNotePath: options.focusNotePath ?? "focus.md",
      runningTimer: options.timer ?? null,
      breakTimer: options.breakTimer ?? null,
    },
    app: {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) =>
          options.fileByPath ? options.fileByPath(path) : file,
        ),
        process,
      },
    },
    patchSettings: vi.fn(async (patch: {
      focusNotePath?: string;
      runningTimer?: RunningTimer | null;
      breakTimer?: PersistedBreak | null;
    }) => {
      plugin.settings = { ...plugin.settings, ...patch };
      if ("runningTimer" in patch) await options.patch?.(plugin.settings.runningTimer);
      await options.patchSettings?.(patch);
    }),
  };
  const service = new TimerService(plugin as never);
  return { service, plugin, process, getContent: () => content };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.restoreAllMocks();
});

describe("TimerService", () => {
  test("reanchors and stops a newly checked task at the supplied fixed time", async () => {
    const checked = "- [x] First task";
    const harness = createHarness({
      timer: { filePath: "focus.md", lineNo: 0, lineText: TASK, startedAt: START },
      content: checked,
    });

    const handled = await harness.service.reanchor(
      "focus.md",
      0,
      TASK,
      0,
      checked,
      START + 10_000,
    );

    expect(handled).toBe(true);
    expect(harness.getContent()).toBe(`${checked} ⏱️ 0:00:10`);
    expect(harness.service.running).toBeNull();
  });

  test("does not resurrect a timer when stale reanchor waits behind stop", async () => {
    const harness = createHarness({
      timer: { filePath: "focus.md", lineNo: 0, lineText: TASK, startedAt: START },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 5_000);

    const stopping = harness.service.stop();
    const reanchoring = harness.service.reanchor(
      "focus.md",
      0,
      TASK,
      0,
      "- [x] First task",
      START + 5_000,
    );
    const [, handled] = await Promise.all([stopping, reanchoring]);

    expect(handled).toBe(false);
    expect(harness.service.running).toBeNull();
    expect(harness.getContent()).toBe(`${TASK} ⏱️ 0:00:05`);
  });

  test("recovers a pending timer onto a unique checkbox-changed anchor", async () => {
    const checked = "- [x] First task";
    const harness = createHarness({
      timer: {
        filePath: "focus.md",
        lineNo: 0,
        lineText: TASK,
        startedAt: START,
        stoppedAt: START + 5_000,
      },
      content: checked,
    });

    const handled = await harness.service.reanchor(
      "focus.md",
      0,
      TASK,
      0,
      checked,
      START + 60_000,
    );

    expect(handled).toBe(true);
    expect(harness.getContent()).toBe(`${checked} ⏱️ 0:00:05`);
    expect(harness.service.running).toBeNull();
  });

  test("refuses pending reanchor when the elapsed baseline changed", async () => {
    const changed = "- [x] First task ⏱️ 0:00:05";
    const pending: RunningTimer = {
      filePath: "focus.md",
      lineNo: 0,
      lineText: TASK,
      startedAt: START,
      stoppedAt: START + 5_000,
    };
    const harness = createHarness({ timer: pending, content: changed });

    const handled = await harness.service.reanchor(
      "focus.md",
      0,
      TASK,
      0,
      changed,
      null,
    );

    expect(handled).toBe(false);
    expect(harness.getContent()).toBe(changed);
    expect(harness.service.running).toEqual(pending);
  });

  test("moves the selected note and active timer to a renamed note while the overlay is closed", async () => {
    const newFile = { path: "renamed.md", extension: "md" };
    const harness = createHarness({
      timer: { filePath: "focus.md", lineNo: 0, lineText: TASK, startedAt: START },
      fileByPath: (path) => path === newFile.path ? newFile : null,
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);

    const renaming = harness.service.renamePaths("focus.md", "renamed.md", false);
    const stopping = harness.service.stop();
    const [, result] = await Promise.all([renaming, stopping]);

    expect(harness.plugin.settings.focusNotePath).toBe("renamed.md");
    expect(result?.kind).toBe("ok");
    expect(harness.getContent()).toBe(`${TASK} ⏱️ 0:00:10`);
    expect(harness.plugin.app.vault.getAbstractFileByPath).toHaveBeenCalledWith("renamed.md");
  });

  test("moves descendant focus and pending stopped timer paths after a folder rename", async () => {
    const pending: RunningTimer = {
      filePath: "old/daily/focus.md",
      lineNo: 0,
      lineText: TASK,
      startedAt: START,
      stoppedAt: START + 10_000,
    };
    const harness = createHarness({
      timer: pending,
      focusNotePath: "old/daily/focus.md",
    });

    await harness.service.renamePaths("old", "archive/old", true);

    expect(harness.plugin.settings.focusNotePath).toBe("archive/old/daily/focus.md");
    expect(harness.service.running).toEqual({
      ...pending,
      filePath: "archive/old/daily/focus.md",
    });
  });

  test("writes a break to the renamed note", async () => {
    const renamedFile = { path: "renamed.md", extension: "md" };
    const harness = createHarness({
      fileByPath: (path) => path === renamedFile.path ? renamedFile : null,
    });
    const now = vi.spyOn(Date, "now").mockReturnValue(START);

    await harness.service.startBreak("focus.md");
    await harness.service.renamePaths("focus.md", "renamed.md", false);
    now.mockReturnValue(START + 10_000);
    await harness.service.endBreak();

    expect(harness.getContent()).toBe(`${TASK}\n☕ 0:00:10`);
    expect(harness.plugin.app.vault.getAbstractFileByPath).toHaveBeenCalledWith("renamed.md");
  });

  test("restores an active break from settings after restart", async () => {
    const harness = createHarness({
      breakTimer: { filePath: "focus.md", startedAt: START },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);

    expect(harness.service.breakStartedAt).toBe(START);
    expect(harness.service.breakStoppedAt).toBeNull();
    await harness.service.endBreak();

    expect(harness.getContent()).toBe(`${TASK}\n☕ 0:00:10`);
    expect(harness.plugin.settings.breakTimer).toBeNull();
  });

  test("restores a frozen break without extending it after restart", async () => {
    const harness = createHarness({
      breakTimer: {
        filePath: "focus.md",
        startedAt: START,
        stoppedAt: START + 10_000,
      },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 60_000);

    await harness.service.endBreak();

    expect(harness.getContent()).toBe(`${TASK}\n☕ 0:00:10`);
    expect(harness.plugin.settings.breakTimer).toBeNull();
  });

  test("freezes a break before the note write and keeps it when settings fail", async () => {
    const harness = createHarness({
      breakTimer: { filePath: "focus.md", startedAt: START },
      patchSettings: async (patch) => {
        if (patch.breakTimer?.stoppedAt !== undefined) {
          throw new Error("settings unavailable");
        }
      },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await harness.service.endBreak();

    expect(harness.service.breakStoppedAt).toBe(START + 10_000);
    expect(harness.process).not.toHaveBeenCalled();
  });

  test("does not add a break twice after note write succeeds and settings cleanup fails", async () => {
    let storedBreak: PersistedBreak | null = { filePath: "focus.md", startedAt: START };
    const first = createHarness({
      breakTimer: storedBreak,
      patchSettings: async (patch) => {
        if (!("breakTimer" in patch)) return;
        const next = patch.breakTimer;
        if (next === null) throw new Error("settings unavailable");
        if (next !== undefined) storedBreak = next;
      },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await first.service.endBreak();

    expect(first.getContent()).toBe(`${TASK}\n☕ 0:00:10`);
    expect(storedBreak?.commit).toEqual({
      lineNo: null,
      beforeTotalSeconds: null,
      afterTotalSeconds: 10,
    });
    expect(first.plugin.settings.breakTimer).toEqual(storedBreak);

    const restarted = createHarness({
      breakTimer: storedBreak,
      content: first.getContent(),
    });
    vi.mocked(Date.now).mockReturnValue(START + 60_000);
    await restarted.service.endBreak();

    expect(restarted.getContent()).toBe(`${TASK}\n☕ 0:00:10`);
    expect(restarted.plugin.settings.breakTimer).toBeNull();
  });

  test("persists an in-memory journal before retrying the note mutation", async () => {
    const stopped: PersistedBreak = {
      filePath: "focus.md",
      startedAt: START,
      stoppedAt: START + 10_000,
    };
    let storedBreak: PersistedBreak | null = stopped;
    let rejectJournal = true;
    const harness = createHarness({
      breakTimer: stopped,
      patchSettings: async (patch) => {
        if (!("breakTimer" in patch) || !patch.breakTimer) return;
        if (patch.breakTimer.commit && rejectJournal) {
          rejectJournal = false;
          throw new Error("settings unavailable");
        }
        storedBreak = patch.breakTimer;
      },
      process: async (update, write) => {
        const before = harness.getContent();
        const after = update(before);
        if (after !== before) expect(storedBreak?.commit).toBeDefined();
        write(after);
      },
    });
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await harness.service.endBreak();
    expect(harness.getContent()).toBe(TASK);
    expect(storedBreak?.commit).toBeUndefined();

    await harness.service.endBreak();
    expect(harness.getContent()).toBe(`${TASK}\n☕ 0:00:10`);
    expect(storedBreak?.commit).toBeDefined();
  });

  test("keeps a pending break when its aggregate total changed externally", async () => {
    const pending: PersistedBreak = {
      filePath: "focus.md",
      startedAt: START,
      stoppedAt: START + 10_000,
      commit: {
        lineNo: 1,
        beforeTotalSeconds: 300,
        afterTotalSeconds: 310,
      },
    };
    const content = `${TASK}\n☕ 0:06:00`;
    const harness = createHarness({ breakTimer: pending, content });

    await harness.service.endBreak();

    expect(harness.getContent()).toBe(content);
    expect(harness.plugin.settings.breakTimer).toEqual(pending);
    expect(notify).toHaveBeenCalledWith(expect.stringContaining("ambiguous"), 15000);
  });

  test("persists a renamed folder path for a pending break", async () => {
    const pending: PersistedBreak = {
      filePath: "old/daily/focus.md",
      startedAt: START,
      stoppedAt: START + 10_000,
    };
    const harness = createHarness({ breakTimer: pending });

    await harness.service.renamePaths("old", "archive/old", true);

    expect(harness.plugin.settings.breakTimer).toEqual({
      ...pending,
      filePath: "archive/old/daily/focus.md",
    });
  });

  test("preserves a break with a fixed end time when its note is missing", async () => {
    let fileAvailable = false;
    const file = { path: "focus.md", extension: "md" };
    const harness = createHarness({
      fileByPath: () => fileAvailable ? file : null,
    });
    const now = vi.spyOn(Date, "now").mockReturnValue(START);

    await harness.service.startBreak("focus.md");
    now.mockReturnValue(START + 10_000);
    await harness.service.endBreak();

    expect(harness.service.breakStartedAt).toBe(START);
    expect(notify).toHaveBeenCalledWith(
      expect.stringContaining("0:00:10 break"),
      15000,
    );

    fileAvailable = true;
    now.mockReturnValue(START + 60_000);
    await harness.service.endBreak();

    expect(harness.getContent()).toBe(`${TASK}\n☕ 0:00:10`);
    expect(harness.service.breakStartedAt).toBeNull();
  });

  test("retries a failed break write without increasing its duration", async () => {
    let fail = true;
    const harness = createHarness({
      process: async (update, write) => {
        if (fail) {
          fail = false;
          throw new Error("disk unavailable");
        }
        write(update(harness.getContent()));
      },
    });
    const now = vi.spyOn(Date, "now").mockReturnValue(START);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await harness.service.startBreak("focus.md");
    now.mockReturnValue(START + 10_000);
    await harness.service.endBreak();
    expect(harness.service.breakStartedAt).toBe(START);

    now.mockReturnValue(START + 60_000);
    await harness.service.endBreak();

    expect(harness.getContent()).toBe(`${TASK}\n☕ 0:00:10`);
    expect(harness.service.breakStartedAt).toBeNull();
  });

  test("serializes a concurrent stop behind an unfinished start", async () => {
    vi.spyOn(Date, "now").mockReturnValue(START);
    const saveStarted = deferred();
    const allowSave = deferred();
    let firstPatch = true;
    const harness = createHarness({
      patch: async () => {
        if (!firstPatch) return;
        firstPatch = false;
        saveStarted.resolve();
        await allowSave.promise;
      },
    });

    const starting = harness.service.start("focus.md", 0, TASK);
    await saveStarted.promise;
    const stopping = harness.service.stop();
    await Promise.resolve();

    expect(harness.process).not.toHaveBeenCalled();
    allowSave.resolve();
    await Promise.all([starting, stopping]);

    expect(harness.process).toHaveBeenCalledTimes(1);
    expect(harness.service.running).toBeNull();
  });

  test("commits only once when two stops run concurrently", async () => {
    const processStarted = deferred();
    const allowWrite = deferred();
    const harness = createHarness({
      timer: { filePath: "focus.md", lineNo: 0, lineText: TASK, startedAt: START },
      process: async (update, write) => {
        processStarted.resolve();
        await allowWrite.promise;
        write(update(harness.getContent()));
      },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);

    const first = harness.service.stop();
    const second = harness.service.stop();
    await processStarted.promise;
    await Promise.resolve();

    expect(harness.process).toHaveBeenCalledTimes(1);
    allowWrite.resolve();
    const results = await Promise.all([first, second]);

    expect(results[0]?.kind).toBe("ok");
    expect(results[1]).toBeNull();
    expect(harness.getContent()).toBe(`${TASK} ⏱️ 0:00:10`);
  });

  test("finishes the first session before a concurrent second start", async () => {
    const processStarted = deferred();
    const allowWrite = deferred();
    const secondTask = "- [ ] Second task";
    const harness = createHarness({
      process: async (update, write) => {
        processStarted.resolve();
        await allowWrite.promise;
        write(update(harness.getContent()));
      },
    });
    vi.spyOn(Date, "now").mockReturnValue(START);

    const first = harness.service.start("focus.md", 0, TASK);
    const second = harness.service.start("focus.md", 1, secondTask);
    await processStarted.promise;

    expect(harness.service.running).toMatchObject({ lineText: TASK, stoppedAt: START });
    allowWrite.resolve();
    await Promise.all([first, second]);

    expect(harness.getContent()).toBe(`${TASK} ⏱️ 0:00:00`);
    expect(harness.service.running).toMatchObject({ lineNo: 1, lineText: secondTask });
  });

  test("treats concurrent starts of the same active target as one start", async () => {
    let now = START;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const harness = createHarness();

    await Promise.all([
      harness.service.start("focus.md", 0, TASK),
      harness.service.start("focus.md", 0, TASK),
    ]);
    now = START + 10_000;
    const result = await harness.service.stop();

    expect(result?.kind).toBe("ok");
    expect(harness.process).toHaveBeenCalledTimes(1);
    expect(harness.getContent()).toBe(`${TASK} ⏱️ 0:00:10`);
    expect(harness.service.running).toBeNull();
  });

  test("reanchors a new timer after successfully retrying the same pending target", async () => {
    let now = START + 20_000;
    vi.spyOn(Date, "now").mockImplementation(() => now);
    const harness = createHarness({
      timer: {
        filePath: "focus.md",
        lineNo: 0,
        lineText: TASK,
        startedAt: START,
        stoppedAt: START + 10_000,
      },
    });

    await harness.service.start("focus.md", 0, TASK);
    expect(harness.service.running).toMatchObject({
      lineNo: 0,
      lineText: `${TASK} ⏱️ 0:00:10`,
      startedAt: START + 20_000,
    });

    now = START + 25_000;
    const result = await harness.service.stop();

    expect(result?.kind).toBe("ok");
    expect(harness.getContent()).toBe(`${TASK} ⏱️ 0:00:15`);
    expect(harness.service.running).toBeNull();
  });

  test("keeps one fixed stop time and retries the same duration", async () => {
    let fail = true;
    const harness = createHarness({
      timer: { filePath: "focus.md", lineNo: 0, lineText: TASK, startedAt: START },
      process: async (update, write) => {
        if (fail) {
          fail = false;
          throw new Error("disk unavailable");
        }
        write(update(harness.getContent()));
      },
    });
    const now = vi.spyOn(Date, "now").mockReturnValue(START + 10_000);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await harness.service.stop();
    expect(harness.service.running).toMatchObject({ stoppedAt: START + 10_000 });

    now.mockReturnValue(START + 60_000);
    await harness.service.stop();

    expect(harness.getContent()).toBe(`${TASK} ⏱️ 0:00:10`);
    expect(harness.service.running).toBeNull();
  });

  test("keeps exact-anchor priority on the first stop", async () => {
    const expectedLine = `${TASK} ⏱️ 0:00:10`;
    const harness = createHarness({
      timer: { filePath: "focus.md", lineNo: 0, lineText: TASK, startedAt: START },
      content: `${TASK}\n${expectedLine}`,
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);

    const result = await harness.service.stop();

    expect(result?.kind).toBe("ok");
    expect(harness.getContent()).toBe(`${expectedLine}\n${expectedLine}`);
    expect(harness.service.running).toBeNull();
  });

  test("keeps the stopped timer in memory when settings persistence fails", async () => {
    const harness = createHarness({
      timer: { filePath: "focus.md", lineNo: 0, lineText: TASK, startedAt: START },
      patch: async (timer) => {
        if (timer !== null) throw new Error("settings unavailable");
      },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await harness.service.stop();

    expect(harness.service.running).toMatchObject({ stoppedAt: START + 10_000 });
    expect(harness.process).not.toHaveBeenCalled();
  });

  test("does not start another timer while the stopped session still cannot be saved", async () => {
    const original: RunningTimer = {
      filePath: "focus.md",
      lineNo: 0,
      lineText: TASK,
      startedAt: START,
    };
    const harness = createHarness({
      timer: original,
      process: async () => {
        throw new Error("disk unavailable");
      },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    await harness.service.start("other.md", 4, "- [ ] Other task");

    expect(harness.service.running).toMatchObject({
      filePath: "focus.md",
      lineText: TASK,
      startedAt: START,
      stoppedAt: START + 10_000,
    });
  });

  test("orders a concurrent endBreak after startBreak", async () => {
    let now = START;
    vi.spyOn(Date, "now").mockImplementation(() => {
      now += 1000;
      return now;
    });
    const harness = createHarness();

    await Promise.all([
      harness.service.startBreak("focus.md"),
      harness.service.endBreak(),
    ]);

    expect(harness.service.breakStartedAt).toBeNull();
    expect(harness.getContent()).toBe(`${TASK}\n☕ 0:00:01`);
  });

  test("uses the line number to distinguish identical task rows", () => {
    const harness = createHarness({
      timer: { filePath: "focus.md", lineNo: 0, lineText: TASK, startedAt: START },
      content: `${TASK}\n${TASK}`,
    });

    expect(harness.service.isRunningOn("focus.md", TASK, 0)).toBe(true);
    expect(harness.service.isRunningOn("focus.md", TASK, 1)).toBe(false);
  });

  test("does not add the session twice after settings cleanup fails", async () => {
    let storedTimer: RunningTimer | null = {
      filePath: "focus.md",
      lineNo: 0,
      lineText: TASK,
      startedAt: START,
    };
    const first = createHarness({
      timer: storedTimer,
      patch: async (timer) => {
        if (timer === null) throw new Error("settings unavailable");
        storedTimer = timer;
      },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    const firstResult = await first.service.stop();
    expect(first.getContent()).toBe(`${TASK} ⏱️ 0:00:10`);
    expect(storedTimer).toMatchObject({ stoppedAt: START + 10_000 });
    expect(firstResult).toBeNull();
    expect(first.service.running).toMatchObject({ stoppedAt: START + 10_000 });

    const restarted = createHarness({ timer: storedTimer, content: first.getContent() });
    vi.mocked(Date.now).mockReturnValue(START + 60_000);
    const result = await restarted.service.stop();

    expect(result?.kind).toBe("already-committed");
    expect(restarted.getContent()).toBe(`${TASK} ⏱️ 0:00:10`);
    expect(restarted.service.running).toBeNull();
  });

  test("retries a shifted committed line in memory without adding time twice", async () => {
    let allowClear = false;
    const harness = createHarness({
      timer: { filePath: "focus.md", lineNo: 0, lineText: TASK, startedAt: START },
      content: `# Focus\n${TASK}`,
      patch: async (timer) => {
        if (timer === null && !allowClear) throw new Error("settings unavailable");
      },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await harness.service.stop()).toBeNull();
    expect(harness.getContent()).toBe(`# Focus\n${TASK} ⏱️ 0:00:10`);
    expect(harness.service.running).toMatchObject({ lineNo: 1, stoppedAt: START + 10_000 });

    allowClear = true;
    const retry = await harness.service.stop();

    expect(retry?.kind).toBe("already-committed");
    expect(harness.getContent()).toBe(`# Focus\n${TASK} ⏱️ 0:00:10`);
    expect(harness.service.running).toBeNull();
  });

  test("recognizes one shifted post-image after cleanup failure and restart", async () => {
    let storedTimer: RunningTimer | null = {
      filePath: "focus.md",
      lineNo: 0,
      lineText: TASK,
      startedAt: START,
    };
    const first = createHarness({
      timer: storedTimer,
      content: `# Focus\n${TASK}`,
      patch: async (timer) => {
        if (timer === null) throw new Error("settings unavailable");
        storedTimer = timer;
      },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);
    vi.spyOn(console, "error").mockImplementation(() => undefined);

    expect(await first.service.stop()).toBeNull();
    expect(storedTimer).toMatchObject({ lineNo: 0, stoppedAt: START + 10_000 });
    expect(first.getContent()).toBe(`# Focus\n${TASK} ⏱️ 0:00:10`);

    const restarted = createHarness({ timer: storedTimer, content: first.getContent() });
    const retry = await restarted.service.stop();

    expect(retry?.kind).toBe("already-committed");
    expect(retry?.lineNo).toBe(1);
    expect(restarted.getContent()).toBe(`# Focus\n${TASK} ⏱️ 0:00:10`);
    expect(restarted.service.running).toBeNull();
  });
});
