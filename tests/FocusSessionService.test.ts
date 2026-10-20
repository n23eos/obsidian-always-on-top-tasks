import { afterEach, describe, expect, test, vi } from "vitest";

vi.mock("../src/notify", () => ({ notify: vi.fn() }));

import { FocusSessionService } from "../src/FocusSessionService";
import { TimerService } from "../src/TimerService";
import {
  elapsedSessionSeconds,
  scanFocusTasks,
  type FocusSession,
} from "../src/core/focusSession";
import { DEFAULT_SETTINGS, type PluginSettings } from "../src/settings";
import type { RunningTimer } from "../src/core/timer";

const START = 1_000_000;
const CONTENT = "# Focus\n- [ ] First\n- [ ] Second\n- [ ] Third";

interface TimerDouble {
  running: RunningTimer | null;
  breakStartedAt: number | null;
  start: ReturnType<typeof vi.fn>;
  stop: ReturnType<typeof vi.fn>;
  endBreak: ReturnType<typeof vi.fn>;
  reanchor: ReturnType<typeof vi.fn>;
}

function activeSession(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    filePath: "focus.md",
    tasks: [{
      lineNo: 1,
      lineText: "- [ ] First",
      text: "First",
      done: false,
      missing: false,
    }],
    status: "active",
    startedAt: START,
    activeSince: START,
    elapsedMs: 0,
    finishedAt: null,
    ...overrides,
  };
}

function createHarness(options: {
  content?: string;
  session?: FocusSession | null;
  running?: RunningTimer | null;
  patch?: (patch: Partial<PluginSettings>) => Promise<void>;
  stop?: (timers: TimerDouble) => Promise<void>;
  endBreak?: (timers: TimerDouble) => Promise<void>;
  contentAfterStop?: string;
  missingFile?: boolean;
} = {}) {
  let content = options.content ?? CONTENT;
  const file = { path: "focus.md", extension: "md" };
  const timers: TimerDouble = {
    running: options.running ?? null,
    breakStartedAt: null,
    start: vi.fn(async (filePath: string, lineNo: number, lineText: string) => {
      timers.running = { filePath, lineNo, lineText, startedAt: Date.now() };
    }),
    stop: vi.fn(async () => {
      if (options.stop) return options.stop(timers);
      timers.running = null;
      if (options.contentAfterStop !== undefined) content = options.contentAfterStop;
    }),
    endBreak: vi.fn(async () => {
      if (options.endBreak) return options.endBreak(timers);
      timers.breakStartedAt = null;
    }),
    reanchor: vi.fn(async (
      filePath: string,
      expectedLineNo: number,
      expectedLineText: string,
      nextLineNo: number,
      nextLineText: string,
      stoppedAt: number | null,
    ) => {
      const running = timers.running;
      if (!running
        || running.filePath !== filePath
        || running.lineNo !== expectedLineNo
        || running.lineText !== expectedLineText
        || running.stoppedAt !== undefined) return false;
      timers.running = stoppedAt === null
        ? { ...running, lineNo: nextLineNo, lineText: nextLineText }
        : null;
      return true;
    }),
  };
  const plugin = {
    settings: { ...DEFAULT_SETTINGS, focusSession: options.session ?? null },
    app: {
      vault: {
        getAbstractFileByPath: vi.fn((path: string) =>
          !options.missingFile && path === file.path ? file : null),
        read: vi.fn(async () => content),
      },
    },
    timers,
    patchSettings: vi.fn(async (patch: Partial<PluginSettings>) => {
      plugin.settings = { ...plugin.settings, ...patch };
      if ("runningTimer" in patch) timers.running = patch.runningTimer ?? null;
      await options.patch?.(patch);
    }),
  };
  return {
    plugin,
    timers,
    service: new FocusSessionService(plugin as never),
    setContent(next: string) { content = next; },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("FocusSessionService", () => {
  test("starts from the latest note snapshot and uses note order", async () => {
    vi.spyOn(Date, "now").mockReturnValue(START);
    const harness = createHarness();
    const candidates = scanFocusTasks(CONTENT);

    await harness.service.start("focus.md", [candidates[2], candidates[0]]);

    expect(harness.service.session?.tasks.map((task) => task.text)).toEqual(["First", "Third"]);
    expect(harness.service.session).toMatchObject({ status: "active", startedAt: START });
    expect(harness.timers.start).toHaveBeenCalledWith("focus.md", 1, "- [ ] First");
  });

  test("rejects invalid goals and stale checked selections", async () => {
    const harness = createHarness();
    await expect(harness.service.start("focus.md", [])).rejects.toThrow("between 1 and 20");

    const selected = scanFocusTasks(CONTENT).slice(0, 1);
    harness.setContent(CONTENT.replace("- [ ] First", "- [x] First"));
    await expect(harness.service.start("focus.md", selected)).rejects.toThrow("changed");
    expect(harness.service.session).toBeNull();
  });

  test("revalidates anchors after stopping an existing selected-task timer", async () => {
    vi.spyOn(Date, "now").mockReturnValue(START);
    const updated = CONTENT.replace("- [ ] First", "- [ ] First ⏱️ 0:00:05");
    const harness = createHarness({
      running: {
        filePath: "focus.md",
        lineNo: 1,
        lineText: "- [ ] First",
        startedAt: START - 5_000,
      },
      contentAfterStop: updated,
    });

    await harness.service.start("focus.md", scanFocusTasks(CONTENT).slice(0, 1));

    expect(harness.service.session?.tasks[0].lineText).toBe("- [ ] First ⏱️ 0:00:05");
    expect(harness.timers.start).toHaveBeenCalledWith(
      "focus.md",
      1,
      "- [ ] First ⏱️ 0:00:05",
    );
  });

  test("refuses duplicate titles and does not replace an unfinished session", async () => {
    const duplicates = "- [ ] Same\n- [ ] Same";
    const duplicateHarness = createHarness({ content: duplicates });
    const forced = scanFocusTasks(duplicates).map((candidate) => ({ ...candidate, eligible: true }));
    await expect(duplicateHarness.service.start("focus.md", forced.slice(0, 1)))
      .rejects.toThrow("changed");

    const existingHarness = createHarness({ session: activeSession() });
    await expect(existingHarness.service.start("focus.md", scanFocusTasks(CONTENT).slice(0, 1)))
      .rejects.toThrow("already in progress");
  });

  test("freezes elapsed time at pause invocation while timer saving waits", async () => {
    let releaseStop: (() => void) | undefined;
    const stopGate = new Promise<void>((resolve) => { releaseStop = resolve; });
    const harness = createHarness({
      session: activeSession(),
      running: { filePath: "focus.md", lineNo: 1, lineText: "- [ ] First", startedAt: START },
      stop: async (timers) => {
        await stopGate;
        timers.running = null;
      },
    });
    const now = vi.spyOn(Date, "now").mockReturnValue(START + 10_000);

    const pausing = harness.service.pause();
    await vi.waitFor(() => expect(harness.timers.stop).toHaveBeenCalled());
    now.mockReturnValue(START + 70_000);
    releaseStop?.();
    await pausing;

    expect(harness.service.session).toMatchObject({
      status: "paused",
      elapsedMs: 10_000,
      activeSince: null,
    });
  });

  test("serializes rapid resume and pause operations", async () => {
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);
    const harness = createHarness({
      session: activeSession({ status: "paused", activeSince: null, elapsedMs: 4_000 }),
    });

    await Promise.all([harness.service.resume(), harness.service.pause()]);

    expect(harness.service.session).toMatchObject({ status: "paused", elapsedMs: 4_000 });
    expect(harness.timers.start).toHaveBeenCalledTimes(1);
    expect(harness.timers.stop).toHaveBeenCalledTimes(1);
  });

  test("freezes the session clock at goal and keeps undo paused until explicit resume", async () => {
    const now = vi.spyOn(Date, "now").mockReturnValue(START + 10_000);
    const harness = createHarness({
      session: activeSession(),
      running: { filePath: "focus.md", lineNo: 1, lineText: "- [ ] First", startedAt: START },
    });

    await harness.service.sync("focus.md", "# Focus\n- [x] First");
    expect(harness.service.session).toMatchObject({
      status: "paused",
      elapsedMs: 10_000,
      activeSince: null,
    });
    now.mockReturnValue(START + 70_000);
    expect(elapsedSessionSeconds(harness.service.session!)).toBe(10);

    await harness.service.sync("focus.md", "# Focus\n- [ ] First");
    expect(harness.service.session).toMatchObject({ status: "paused", elapsedMs: 10_000 });
    expect(harness.service.session?.tasks[0].done).toBe(false);

    await harness.service.resume();
    expect(harness.service.session?.status).toBe("active");
    expect(harness.timers.start).toHaveBeenCalledTimes(1);
  });

  test("does not resume the clock when no valid next task remains", async () => {
    const harness = createHarness({
      content: "# Focus\n- [x] First",
      session: activeSession({
        status: "paused",
        activeSince: null,
        elapsedMs: 10_000,
        tasks: [{
          lineNo: 1,
          lineText: "- [x] First",
          text: "First",
          done: true,
          missing: false,
        }],
      }),
    });

    await harness.service.resume();

    expect(harness.service.session).toMatchObject({ status: "paused", elapsedMs: 10_000 });
    expect(harness.timers.start).not.toHaveBeenCalled();
    expect(harness.timers.endBreak).not.toHaveBeenCalled();
  });

  test("keeps finish retryable when the task timer cannot be saved", async () => {
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);
    const harness = createHarness({
      session: activeSession(),
      running: { filePath: "focus.md", lineNo: 1, lineText: "- [ ] First", startedAt: START },
      stop: async (timers) => {
        if (timers.running) timers.running = { ...timers.running, stoppedAt: START + 10_000 };
      },
    });

    await expect(harness.service.finish()).rejects.toThrow("could not be saved");

    expect(harness.service.session).toMatchObject({ status: "paused", elapsedMs: 10_000 });
    expect(harness.service.session?.finishedAt).toBeNull();
    expect(harness.timers.running?.stoppedAt).toBe(START + 10_000);
  });

  test("syncs only the session note and keeps finished snapshots frozen", async () => {
    const harness = createHarness({ session: activeSession() });
    await harness.service.sync("other.md", "- [x] First");
    expect(harness.plugin.patchSettings).not.toHaveBeenCalled();

    await harness.service.sync("focus.md", "- [x] First");
    expect(harness.service.session?.tasks[0].done).toBe(true);

    const finished = { ...harness.service.session!, status: "finished" as const, finishedAt: START };
    harness.plugin.settings = { ...harness.plugin.settings, focusSession: finished };
    harness.plugin.patchSettings.mockClear();
    await harness.service.sync("focus.md", "- [ ] First");
    expect(harness.plugin.patchSettings).not.toHaveBeenCalled();
    expect(harness.service.session?.tasks[0].done).toBe(true);
  });

  test("renames note and folder paths and persists inline task renames", async () => {
    const harness = createHarness({
      session: activeSession({ filePath: "old/daily/focus.md" }),
    });
    await harness.service.renamePaths("old", "archive/old", true);
    expect(harness.service.session?.filePath).toBe("archive/old/daily/focus.md");

    harness.plugin.settings = {
      ...harness.plugin.settings,
      focusSession: activeSession(),
    };
    await harness.service.reanchor("focus.md", 1, "- [ ] First", "- [ ] Renamed");
    expect(harness.service.session?.tasks[0]).toMatchObject({
      text: "Renamed",
      lineText: "- [ ] Renamed",
    });
  });

  test("rolls back a failed final settings write", async () => {
    let fail = true;
    const harness = createHarness({
      session: activeSession({ status: "paused", activeSince: null }),
      patch: async (patch) => {
        if (fail && patch.focusSession?.status === "finished") {
          fail = false;
          throw new Error("disk unavailable");
        }
      },
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);

    await expect(harness.service.finish()).rejects.toThrow("Could not save");
    expect(harness.service.session?.status).toBe("paused");
    await harness.service.finish();
    expect(harness.service.session?.status).toBe("finished");
  });

  test("allows an early finish after the note was removed when no timer is pending", async () => {
    const harness = createHarness({
      session: activeSession({ status: "paused", activeSince: null }),
      missingFile: true,
    });
    vi.spyOn(Date, "now").mockReturnValue(START + 10_000);

    await harness.service.finish();

    expect(harness.service.session?.status).toBe("finished");
    expect(harness.service.session?.tasks[0]).toMatchObject({ done: false, missing: true });
  });

  test("recovers one exact duration when external checkbox sync races with stop", async () => {
    let content = CONTENT.replace("- [ ] First", "- [x] First");
    const file = { path: "focus.md", extension: "md" };
    const running: RunningTimer = {
      filePath: "focus.md",
      lineNo: 1,
      lineText: "- [ ] First",
      startedAt: START,
    };
    const runningPatches: Array<RunningTimer | null> = [];
    const plugin = {
      settings: {
        ...DEFAULT_SETTINGS,
        focusSession: activeSession(),
        runningTimer: running,
      } as PluginSettings,
      app: {
        vault: {
          getAbstractFileByPath: vi.fn(() => file),
          read: vi.fn(async () => content),
          process: vi.fn(async (_file: unknown, update: (current: string) => string) => {
            content = update(content);
          }),
        },
      },
      patchSettings: vi.fn(async (patch: Partial<PluginSettings>) => {
        plugin.settings = { ...plugin.settings, ...patch };
        if ("runningTimer" in patch) runningPatches.push(patch.runningTimer ?? null);
        await Promise.resolve();
      }),
      timers: null as unknown as TimerService,
    };
    plugin.timers = new TimerService(plugin as never);
    const service = new FocusSessionService(plugin as never);
    vi.spyOn(Date, "now").mockReturnValue(START + 5_000);

    await Promise.allSettled([service.sync("focus.md", content), plugin.timers.stop()]);
    await service.refresh("focus.md");

    expect(content).toContain("- [x] First ⏱️ 0:00:05");
    expect(content).not.toContain("0:00:10");
    expect(plugin.settings.runningTimer).toBeNull();
    expect(runningPatches.at(-1)).toBeNull();
  });

  test("integrates with TimerService through CRLF start, pause, resume and finish", async () => {
    let content = CONTENT.replace(/\n/g, "\r\n");
    const file = { path: "focus.md", extension: "md" };
    const plugin = {
      settings: { ...DEFAULT_SETTINGS },
      app: {
        vault: {
          getAbstractFileByPath: vi.fn(() => file),
          read: vi.fn(async () => content),
          process: vi.fn(async (_file: unknown, update: (current: string) => string) => {
            content = update(content);
          }),
        },
      },
      patchSettings: vi.fn(async (patch: Partial<PluginSettings>) => {
        plugin.settings = { ...plugin.settings, ...patch };
      }),
      timers: null as unknown as TimerService,
    };
    plugin.timers = new TimerService(plugin as never);
    const service = new FocusSessionService(plugin as never);
    let now = START;
    vi.spyOn(Date, "now").mockImplementation(() => now);

    await service.start("focus.md", scanFocusTasks(content).slice(0, 2));
    now += 5_000;
    await service.pause();
    expect(content).toContain("First ⏱️ 0:00:05");
    expect(service.session?.status).toBe("paused");

    now += 60_000;
    await service.resume();
    expect(service.session).toMatchObject({ status: "active", elapsedMs: 5_000 });
    now += 3_000;
    content = content.replace(
      "- [ ] First ⏱️ 0:00:05\r",
      "- [x] 🔵 First ⏱️ 0:00:05\r",
    );
    await service.sync("focus.md", content);
    expect(plugin.settings.runningTimer).toBeNull();
    await service.finish();

    expect(content).toContain("- [x] 🔵 First ⏱️ 0:00:08\r");
    expect(service.session).toMatchObject({ status: "finished", elapsedMs: 8_000 });
    expect(plugin.settings.runningTimer).toBeNull();
  });
});
