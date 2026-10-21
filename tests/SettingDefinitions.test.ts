import { expect, it } from "vitest";
import { buildSettingDefinitions, VISIBILITY_KEYS } from "../src/SettingDefinitions";
import { DEFAULT_SETTINGS } from "../src/settings";

it("keeps the session switch visible while hiding dependent settings", () => {
  const settings = { ...DEFAULT_SETTINGS };
  const definitions = buildSettingDefinitions({ settings: () => settings, resetToDefaults() {} });
  const group = definitions.find((item) => "type" in item && item.type === "group" && item.heading === "Focus sessions");
  if (!group || !("items" in group)) throw new Error("Missing focus settings group");
  const items = group.items ?? [];
  const controls = items.filter((item) => !("type" in item));
  expect(controls.map((item) => !("type" in item) && item.control && "key" in item.control ? item.control.key : null))
    .toEqual(["focusSessionsEnabled", "focusTaskGoal", "focusOnly"]);
  settings.focusSessionsEnabled = false;
  expect(controls[0].visible).not.toBe(false);
  for (const control of controls.slice(1)) {
    expect(typeof control.visible === "function" && control.visible()).toBe(false);
  }
  expect(VISIBILITY_KEYS).toContain("focusSessionsEnabled");
});
