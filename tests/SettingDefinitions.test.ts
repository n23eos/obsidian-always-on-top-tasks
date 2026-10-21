import { expect, it } from "vitest";
import { buildSettingDefinitions, VISIBILITY_KEYS } from "../src/SettingDefinitions";
import { DEFAULT_SETTINGS } from "../src/settings";

function settingGroup(heading: string, settings = { ...DEFAULT_SETTINGS }) {
  const definitions = buildSettingDefinitions({ settings: () => settings, resetToDefaults() {} });
  const group = definitions.find((item) => "type" in item && item.type === "group" && item.heading === heading);
  if (!group || !("items" in group)) throw new Error(`Missing ${heading} settings group`);
  return { group, settings };
}

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

it("offers a full-height or bounded docked overlay height", () => {
  const { group, settings } = settingGroup("Overlay window");
  const fullHeight = (group.items ?? []).find((item) =>
    !("type" in item) && item.control && "key" in item.control && item.control.key === "overlayFullHeight",
  );
  const height = (group.items ?? []).find((item) =>
    !("type" in item) && item.control && "key" in item.control && item.control.key === "overlayHeight",
  );
  if (!fullHeight || "type" in fullHeight || !fullHeight.control || fullHeight.control.type !== "toggle"
    || !height || "type" in height || !height.control || height.control.type !== "slider") {
    throw new Error("Missing overlay height controls");
  }

  expect(height.control).toMatchObject({ min: 200, max: 1200, step: 50 });
  expect(height.control.displayFormat?.(650)).toBe("650 px");
  expect(typeof fullHeight.visible === "function" && fullHeight.visible()).toBe(true);
  expect(typeof height.visible === "function" && height.visible()).toBe(false);
  settings.overlayFullHeight = false;
  expect(typeof height.visible === "function" && height.visible()).toBe(true);
  settings.dockMode = "free";
  expect(typeof fullHeight.visible === "function" && fullHeight.visible()).toBe(false);
  expect(typeof height.visible === "function" && height.visible()).toBe(false);
  expect(VISIBILITY_KEYS).toContain("overlayFullHeight");
});
