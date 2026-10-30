import { TFile } from "./obsidian.mjs";
import { FocusOverlayView } from "../../src/overlay/FocusOverlayView.ts";
import { TimerService } from "../../src/TimerService.ts";
import { StatusBarTimer } from "../../src/StatusBarTimer.ts";
import { DEFAULT_SETTINGS } from "../../src/settings.ts";
import { migrateSettings } from "../../src/settings.ts";
import { FocusSessionService } from "../../src/FocusSessionService.ts";
import { SettingsPersistence } from "../../src/SettingsPersistence.ts";

const presentation = new URLSearchParams(location.search).has("presentation");
const scratch = new Map();
const storage = presentation ? { getItem: key => scratch.get(key) ?? null, setItem: (key, value) => scratch.set(key, value), removeItem: key => scratch.delete(key) } : localStorage;
const file = new TFile("Сегодня.md");
const initialContent = [
  "- [ ] 🔵 Подготовить обновление плагина ⏱️ 0:12:00",
  "  - [x] Проверить сохранение ⏱️ 0:08:35",
  "  - [ ] Проверить длинное название задачи на узкой панели ⏱️ 0:02:20",
  "- Lectures",
  "  - [ ] Lecture one",
  "    - [x] Notes",
  "  - [ ] Lecture two",
  "- [ ] Одинаковая задача",
  "- [ ] Одинаковая задача",
  ...Array.from({ length: 14 }, (_, i) => `- [ ] Следующий шаг ${i + 1}`),
].join("\n");
let content = storage.getItem("focus-preview-note") ?? initialContent;
let failWrite = false;
const handlers = new Map();
const plugin = {
  settings: migrateSettings(JSON.parse(storage.getItem("focus-preview-settings") ?? "null") ?? { ...DEFAULT_SETTINGS, tasksOnly: true }),
  app: { workspace: { requestSaveLayout() { storage.setItem("focus-preview-view", JSON.stringify(view.getState())); } }, vault: {
    getAbstractFileByPath: (path) => path === file.path ? file : null,
    cachedRead: async () => content,
    read: async () => content,
    on(event, handler) { handlers.set(event, handler); },
    async process(_file, fn) {
      if (failWrite) { failWrite = false; throw new Error("Simulated write failure"); }
      content = fn(content);
      storage.setItem("focus-preview-note", content);
      document.querySelector("#source").textContent = content;
      handlers.get("modify")?.(file);
    },
  } },
  overlay: { isPinned: true, blur() {}, togglePin() { this.isPinned = !this.isPinned; }, close() {} },
  async patchSettings(patch) { await persistence.patch(patch); },
  async updateSettings(patch) {
    const { focusSessionsEnabled, ...rest } = patch;
    if (focusSessionsEnabled !== undefined) await this.focusSessions.setEnabled(focusSessionsEnabled);
    await this.patchSettings(rest);
    view.requestRender();
  },
  refreshOverlayViews() { view.requestRender(); },
  addStatusBarItem() { return document.querySelector("#status").createSpan(); },
  async stopRunningTimer() { await this.timers.stop(); view.requestRender(); },
};
const persistence = new SettingsPersistence({
  get: () => plugin.settings,
  set: (settings) => { plugin.settings = settings; },
  save: async (settings) => storage.setItem("focus-preview-settings", JSON.stringify(settings)),
});
plugin.timers = new TimerService(plugin);
plugin.focusSessions = new FocusSessionService(plugin);
const view = new FocusOverlayView({}, plugin);
await view.onOpen();
await view.setState(JSON.parse(storage.getItem("focus-preview-view") ?? "null") ?? { filePath: file.path }, {});
const status = new StatusBarTimer(plugin);
status.sync();
setInterval(() => status.tick(), 1000);
document.querySelector("#source").textContent = content;
document.querySelector("#theme").onclick = () => document.body.classList.toggle("light");
document.querySelector("#width").onclick = () => {
  const frame = document.querySelector(".window");
  frame.style.width = frame.style.width === "280px" ? "340px" : "280px";
};
document.querySelector("#fail").onclick = () => { failWrite = true; document.querySelector("#notice").textContent = "Следующая запись завершится ошибкой. Остановите таймер задачи или перерыва."; };
document.querySelector("#reload").onclick = () => location.reload();
document.querySelector("#reset").onclick = () => {
  storage.removeItem("focus-preview-settings");
  storage.removeItem("focus-preview-note");
  storage.removeItem("focus-preview-view");
  location.reload();
};
document.querySelector("#size").onchange = (event) => {
  document.querySelector(".window").style.width = `${event.target.value}px`;
};
addEventListener("error", (event) => { document.querySelector("#errors").textContent += event.message; });
addEventListener("unhandledrejection", (event) => { document.querySelector("#errors").textContent += String(event.reason); });

const sessionsToggle = document.querySelector("#sessions");
sessionsToggle.checked = plugin.settings.focusSessionsEnabled;
sessionsToggle.onchange = async () => {
  await plugin.updateSettings({ focusSessionsEnabled: sessionsToggle.checked });
};

const { runHierarchyQA } = await import('./hierarchy-qa.mjs');
document.querySelector('#hierarchy-qa').onclick = async () => {
  const result = document.querySelector('#qa-result');
  try {
    result.textContent = JSON.stringify(await runHierarchyQA({ view, plugin, getContent: () => content, setContent: value => { content = value; storage.setItem("focus-preview-note", content); document.querySelector("#source").textContent = content; } }));
  } catch (error) { result.textContent = `FAIL: ${error.message}`; }
};

const { runSubtaskQA } = await import('./subtask-qa.mjs');
document.querySelector('#subtask-qa').onclick = async () => {
  const result = document.querySelector('#qa-result');
  try {
    result.textContent = JSON.stringify(await runSubtaskQA({ view, plugin, getContent: () => content, setContent: value => { content = value; storage.setItem("focus-preview-note", content); document.querySelector("#source").textContent = content; }, failNextWrite: () => { failWrite = true; } }));
  } catch (error) { result.textContent = `FAIL: ${error.message}`; }
};

export { view, plugin, file };
