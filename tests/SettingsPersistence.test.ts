import { describe, expect, test } from "vitest";
import { SettingsPersistence } from "../src/SettingsPersistence";
import { DEFAULT_SETTINGS, type PluginSettings } from "../src/settings";

function harness(initial: PluginSettings = { ...DEFAULT_SETTINGS }) {
  let state = initial;
  const stored: PluginSettings[] = [];
  let rejectFirst: ((error: Error) => void) | undefined;
  let first = true;
  const persistence = new SettingsPersistence({
    get: () => state,
    set: (next) => { state = next; },
    save: async (next) => {
      if (first) {
        first = false;
        await new Promise<void>((_resolve, reject) => { rejectFirst = reject; });
      }
      stored.push(next);
    },
  });
  return { persistence, state: () => state, stored, fail: () => rejectFirst?.(new Error("disk unavailable")) };
}

describe("SettingsPersistence", () => {
  test("a queued appearance write cannot resurrect a rejected session start", async () => {
    const h = harness();
    const start = h.persistence.patch({
      focusSession: {
        filePath: "focus.md", tasks: [{ lineNo: 0, lineText: "- [ ] Work", text: "Work", done: false, missing: false }],
        status: "active", startedAt: 100, activeSince: 100, elapsedMs: 0, finishedAt: null,
      },
    });
    const appearance = h.persistence.patch({ fontSize: 16 });
    const rejected = expect(start).rejects.toThrow("disk unavailable");
    await Promise.resolve();
    h.fail();
    await rejected;
    await appearance;
    expect(h.state().focusSession).toBeNull();
    expect(h.state().fontSize).toBe(16);
    expect(h.stored).toHaveLength(1);
    expect(h.stored[0].focusSession).toBeNull();
  });

  test("a failed stop stays frozen before the next queued settings write", async () => {
    const timer = { filePath: "focus.md", lineNo: 0, lineText: "- [ ] Work", startedAt: 100 };
    const stopped = { ...timer, stoppedAt: 200 };
    const h = harness({ ...DEFAULT_SETTINGS, runningTimer: timer });
    const stop = h.persistence.patch({ runningTimer: stopped });
    const appearance = h.persistence.patch({ fontSize: 16 });
    const rejected = expect(stop).rejects.toThrow();
    await Promise.resolve();
    h.fail();
    await rejected;
    await appearance;
    expect(h.state().runningTimer).toEqual(stopped);
    expect(h.stored[0].runningTimer).toEqual(stopped);
  });

  test("a failed timer cleanup never publishes a cleared timer", async () => {
    const timer = { filePath: "focus.md", lineNo: 0, lineText: "- [ ] Work", startedAt: 100, stoppedAt: 200 };
    const h = harness({ ...DEFAULT_SETTINGS, runningTimer: timer });
    const clear = h.persistence.patch({ runningTimer: null });
    const next = h.persistence.patch({ opacity: 0.8 });
    const rejected = expect(clear).rejects.toThrow();
    await Promise.resolve();
    h.fail();
    await rejected;
    await next;
    expect(h.state().runningTimer).toEqual(timer);
    expect(h.stored[0].runningTimer).toEqual(timer);
  });

  test("a failed frozen break write remains pending for the next queued write", async () => {
    const active = { filePath: "focus.md", startedAt: 100 };
    const stopped = { ...active, stoppedAt: 200 };
    const h = harness({ ...DEFAULT_SETTINGS, breakTimer: active });
    const stop = h.persistence.patch({ breakTimer: stopped });
    const appearance = h.persistence.patch({ fontSize: 16 });
    const rejected = expect(stop).rejects.toThrow();
    await Promise.resolve();
    h.fail();
    await rejected;
    await appearance;
    expect(h.state().breakTimer).toEqual(stopped);
    expect(h.stored[0].breakTimer).toEqual(stopped);
  });

  test("a failed break cleanup never publishes a cleared break", async () => {
    const pending = { filePath: "focus.md", startedAt: 100, stoppedAt: 200 };
    const h = harness({ ...DEFAULT_SETTINGS, breakTimer: pending });
    const clear = h.persistence.patch({ breakTimer: null });
    const next = h.persistence.patch({ opacity: 0.8 });
    const rejected = expect(clear).rejects.toThrow();
    await Promise.resolve();
    h.fail();
    await rejected;
    await next;
    expect(h.state().breakTimer).toEqual(pending);
    expect(h.stored[0].breakTimer).toEqual(pending);
  });

  test("a failed fresh break start is not published only in memory", async () => {
    const h = harness();
    const start = h.persistence.patch({
      breakTimer: { filePath: "focus.md", startedAt: 100 },
    });
    const rejected = expect(start).rejects.toThrow();
    await Promise.resolve();
    h.fail();
    await rejected;
    expect(h.state().breakTimer).toBeNull();
  });
});
