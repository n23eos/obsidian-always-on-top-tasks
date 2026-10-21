import { afterEach, expect, it, vi } from "vitest";
import type { App } from "obsidian";
import * as host from "obsidian";
import type TasksForFocusPlugin from "../src/main";
import { DEFAULT_SETTINGS } from "../src/settings";

vi.mock("../src/FileSuggest", () => ({ FileSuggest: class {} }));
vi.mock("../src/notify", () => ({ notify: vi.fn() }));
import { notify } from "../src/notify";
import { TasksForFocusSettingsTab } from "../src/SettingsTab";

afterEach(() => vi.restoreAllMocks());

it.each([true, false])("restores the switch after failed disable (modern settings: %s)", async (modern) => {
  vi.spyOn(host, "requireApiVersion").mockReturnValue(modern);
  const plugin = {
    settings: { ...DEFAULT_SETTINGS, focusSessionsEnabled: true },
    updateSettings: vi.fn(async () => { throw new Error("Could not save timer"); }),
  };
  const tab = new TasksForFocusSettingsTab({} as App, plugin as unknown as TasksForFocusPlugin);
  const refresh = modern ? vi.spyOn(tab, "update") :
    vi.spyOn(tab as unknown as { renderLegacy: () => void }, "renderLegacy").mockImplementation(() => {});
  await expect(tab.setControlValue("focusSessionsEnabled", false)).resolves.toBeUndefined();
  expect(tab.getControlValue("focusSessionsEnabled")).toBe(true);
  expect(refresh).toHaveBeenCalledOnce();
  expect(notify).toHaveBeenCalledWith("Could not save timer");
});
