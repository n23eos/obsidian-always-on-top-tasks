import { describe, expect, test } from "vitest";
import { DEFAULT_SETTINGS, migrateSettings, resetToDefaults } from "../src/settings";

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
});

describe("resetToDefaults", () => {
  test("keeps the pinned note and the running timer", () => {
    const timer = { filePath: "a.md", lineNo: 0, lineText: "- [ ] x", startedAt: 1 };
    const current = { ...DEFAULT_SETTINGS, opacity: 0.5, focusNotePath: "a.md", runningTimer: timer };
    const reset = resetToDefaults(current);
    expect(reset.opacity).toBe(DEFAULT_SETTINGS.opacity);
    expect(reset.focusNotePath).toBe("a.md");
    expect(reset.runningTimer).toBe(timer);
  });
});
