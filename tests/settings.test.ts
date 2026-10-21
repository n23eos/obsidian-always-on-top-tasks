import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, migrateSettings, resetToDefaults } from "../src/settings";
import type { FocusSession } from "../src/core/focusSession";
import type { PersistedBreak } from "../src/core/breakLine";

const FOCUS_SESSION: FocusSession = {
  filePath: "a.md",
  tasks: [{
    lineNo: 0,
    lineText: "- [ ] x",
    text: "x",
    done: false,
    missing: false,
  }],
  status: "paused",
  startedAt: 1,
  activeSince: null,
  elapsedMs: 2_000,
  finishedAt: null,
};

describe("migrateSettings", () => {
  test("returns defaults for null or garbage", () => {
    expect(migrateSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(migrateSettings("junk")).toEqual(DEFAULT_SETTINGS);
  });

  test("maps the pre-0.7.0 edge field onto dockMode", () => {
    const migrated = migrateSettings({ edge: "left", opacity: 0.8 });
    expect(migrated.dockMode).toBe("left");
    expect(migrated.opacity).toBe(0.8);
    expect("edge" in migrated).toBe(false);
  });

  test("an explicit dockMode wins over a stale edge field", () => {
    expect(migrateSettings({ edge: "left", dockMode: "free" }).dockMode).toBe("free");
  });

  test("adds focus defaults to settings saved by an older version", () => {
    const migrated = migrateSettings({ opacity: 0.8 });
    expect(migrated.focusSession).toBeNull();
    expect(migrated.focusSessionsEnabled).toBe(true);
    expect(migrated.focusTaskGoal).toBe(3);
    expect(migrated.focusOnly).toBe(true);
  });

  test("validates focus settings and persisted session data", () => {
    expect(migrateSettings({
      focusSessionsEnabled: false,
      focusTaskGoal: 20,
      focusOnly: false,
      focusSession: FOCUS_SESSION,
    })).toMatchObject({
      focusSessionsEnabled: false,
      focusTaskGoal: 20,
      focusOnly: false,
      focusSession: FOCUS_SESSION,
    });

    expect(migrateSettings({
      focusSessionsEnabled: "no",
      focusTaskGoal: 0,
      focusOnly: "yes",
      focusSession: { ...FOCUS_SESSION, tasks: [] },
    })).toMatchObject({
      focusSessionsEnabled: true,
      focusTaskGoal: 3,
      focusOnly: true,
      focusSession: null,
    });
  });

  test("validates persisted active and pending breaks", () => {
    const active: PersistedBreak = {
      filePath: "focus.md",
      startedAt: 1_000,
    };
    const pending: PersistedBreak = {
      ...active,
      stoppedAt: 11_000,
      commit: {
        lineNo: 2,
        beforeTotalSeconds: 300,
        afterTotalSeconds: 310,
      },
    };

    expect(migrateSettings({ breakTimer: active }).breakTimer).toEqual(active);
    expect(migrateSettings({ breakTimer: pending }).breakTimer).toEqual(pending);
    expect(migrateSettings({
      breakTimer: {
        ...pending,
        commit: { ...pending.commit!, afterTotalSeconds: 311 },
      },
    }).breakTimer).toBeNull();
    expect(migrateSettings({
      breakTimer: { filePath: "", startedAt: -1, stoppedAt: 0 },
    }).breakTimer).toBeNull();
  });
});

describe("resetToDefaults", () => {
  test("keeps the pinned note, running timer, break and focus session", () => {
    const timer = { filePath: "a.md", lineNo: 0, lineText: "- [ ] x", startedAt: 1 };
    const breakTimer: PersistedBreak = { filePath: "a.md", startedAt: 1 };
    const current = {
      ...DEFAULT_SETTINGS,
      opacity: 0.5,
      focusNotePath: "a.md",
      runningTimer: timer,
      breakTimer,
      focusSession: FOCUS_SESSION,
      focusSessionsEnabled: false,
    };
    const reset = resetToDefaults(current);
    expect(reset.opacity).toBe(DEFAULT_SETTINGS.opacity);
    expect(reset.focusNotePath).toBe("a.md");
    expect(reset.runningTimer).toBe(timer);
    expect(reset.breakTimer).toBe(breakTimer);
    expect(reset.focusSession).toBe(FOCUS_SESSION);
    expect(reset.focusSessionsEnabled).toBe(true);
  });
});
