import { describe, expect, test, vi } from "vitest";
import { prepareQuitState } from "../src/quit/prepareQuit";
import { SettingsPersistence } from "../src/SettingsPersistence";
import { DEFAULT_SETTINGS, type PluginSettings } from "../src/settings";

const SETTLED = Promise.resolve();

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve!: () => void;
  const promise = new Promise<void>((done) => { resolve = done; });
  return { promise, resolve };
}

function queueView(read: () => Promise<void>): { readonly pendingWork: Promise<void> } {
  return { get pendingWork() { return read(); } };
}

describe("prepareQuitState", () => {
  test("waits for timer work enqueued by deferred focus work before checkpoint", async () => {
    const focusGate = deferred();
    const timerGate = deferred();
    let timerWork = SETTLED;
    const focusWork = focusGate.promise.then(() => { timerWork = timerGate.promise; });
    const checkpoint = vi.fn(async () => undefined);

    const preparing = prepareQuitState(
      queueView(() => focusWork),
      queueView(() => timerWork),
      checkpoint,
      () => true,
    );
    focusGate.resolve();
    await focusWork;

    expect(checkpoint).not.toHaveBeenCalled();
    timerGate.resolve();
    await expect(preparing).resolves.toBe(true);
    expect(checkpoint).toHaveBeenCalledTimes(1);
  });

  test("waits for focus reanchor enqueued by deferred timer work", async () => {
    const timerGate = deferred();
    const focusGate = deferred();
    let focusWork = SETTLED;
    const timerWork = timerGate.promise.then(() => { focusWork = focusGate.promise; });
    const checkpoint = vi.fn(async () => undefined);

    const preparing = prepareQuitState(
      queueView(() => focusWork),
      queueView(() => timerWork),
      checkpoint,
      () => true,
    );
    timerGate.resolve();
    await timerWork;

    expect(checkpoint).not.toHaveBeenCalled();
    focusGate.resolve();
    await expect(preparing).resolves.toBe(true);
    expect(checkpoint).toHaveBeenCalledTimes(1);
  });

  test("runs another drain and checkpoint when work appears during checkpoint", async () => {
    const lateFocus = deferred();
    const checkpointStarted = deferred();
    let focusWork = SETTLED;
    let calls = 0;
    const checkpoint = async () => {
      calls += 1;
      if (calls === 1) {
        focusWork = lateFocus.promise;
        checkpointStarted.resolve();
      }
    };

    const preparing = prepareQuitState(
      queueView(() => focusWork),
      queueView(() => SETTLED),
      checkpoint,
      () => true,
    );
    await checkpointStarted.promise;
    expect(calls).toBe(1);

    lateFocus.resolve();
    await expect(preparing).resolves.toBe(true);
    expect(calls).toBe(2);
  });

  test("propagates checkpoint failure so quit remains blocked", async () => {
    const failure = new Error("disk unavailable");
    await expect(prepareQuitState(
      queueView(() => SETTLED),
      queueView(() => SETTLED),
      async () => { throw failure; },
      () => true,
    )).rejects.toBe(failure);
  });

  test("returns false without checkpoint when the request was canceled", async () => {
    const checkpoint = vi.fn(async () => undefined);
    await expect(prepareQuitState(
      queueView(() => SETTLED),
      queueView(() => SETTLED),
      checkpoint,
      () => false,
    )).resolves.toBe(false);
    expect(checkpoint).not.toHaveBeenCalled();
  });

  test("checkpoint persists a recovered pending timer from current state", async () => {
    const pending = {
      filePath: "focus.md",
      lineNo: 1,
      lineText: "- [ ] Work",
      startedAt: 100,
      stoppedAt: 200,
    };
    let state: PluginSettings = { ...DEFAULT_SETTINGS, runningTimer: pending };
    const saved: PluginSettings[] = [];
    const persistence = new SettingsPersistence({
      get: () => state,
      set: (next) => { state = next; },
      save: async (next) => { saved.push(next); },
    });

    const ready = await prepareQuitState(
      queueView(() => SETTLED),
      queueView(() => SETTLED),
      () => persistence.patch({}),
      () => true,
    );

    expect(ready).toBe(true);
    expect(saved).toHaveLength(1);
    expect(saved[0].runningTimer).toEqual(pending);
  });
});
