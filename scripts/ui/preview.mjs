import { TFile } from "./obsidian.mjs";
import { FocusOverlayView } from "../../src/overlay/FocusOverlayView.ts";
import { TimerService } from "../../src/TimerService.ts";
import { StatusBarTimer } from "../../src/StatusBarTimer.ts";
import { DEFAULT_SETTINGS } from "../../src/settings.ts";
import { migrateSettings } from "../../src/settings.ts";
import { FocusSessionService } from "../../src/FocusSessionService.ts";
import { SettingsPersistence } from "../../src/SettingsPersistence.ts";

const file = new TFile("Сегодня.md");
const initialContent = [
  "- [ ] 🔵 Подготовить обновление плагина ⏱️ 0:12:00",
  "  - [x] Проверить сохранение ⏱️ 0:08:35",
  "  - [ ] Проверить длинное название задачи на узкой панели ⏱️ 0:02:20",
  "- [ ] Одинаковая задача",
  "- [ ] Одинаковая задача",
  ...Array.from({ length: 14 }, (_, i) => `- [ ] Следующий шаг ${i + 1}`),
].join("\n");
let content = localStorage.getItem("focus-preview-note") ?? initialContent;
let failWrite = false;
const handlers = new Map();
const plugin = {
  settings: migrateSettings(JSON.parse(localStorage.getItem("focus-preview-settings") ?? "null") ?? { ...DEFAULT_SETTINGS, tasksOnly: true }),
  app: { vault: {
    getAbstractFileByPath: (path) => path === file.path ? file : null,
    cachedRead: async () => content,
    read: async () => content,
    on(event, handler) { handlers.set(event, handler); },
    async process(_file, fn) {
      if (failWrite) { failWrite = false; throw new Error("Simulated write failure"); }
      content = fn(content);
      localStorage.setItem("focus-preview-note", content);
      document.querySelector("#source").textContent = content;
      handlers.get("modify")?.(file);
    },
  } },
  overlay: { isPinned: true, blur() {}, togglePin() { this.isPinned = !this.isPinned; }, close() {} },
  async patchSettings(patch) { await persistence.patch(patch); },
  async updateSettings(patch) { await this.patchSettings(patch); view.requestRender(); },
  refreshOverlayViews() { view.requestRender(); },
  addStatusBarItem() { return document.querySelector("#status").createSpan(); },
  async stopRunningTimer() { await this.timers.stop(); view.requestRender(); },
};
const persistence = new SettingsPersistence({
  get: () => plugin.settings,
  set: (settings) => { plugin.settings = settings; },
  save: async (settings) => localStorage.setItem("focus-preview-settings", JSON.stringify(settings)),
});
plugin.timers = new TimerService(plugin);
plugin.focusSessions = new FocusSessionService(plugin);
const view = new FocusOverlayView({}, plugin);
await view.onOpen();
await view.setState({ filePath: file.path }, {});
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
  localStorage.removeItem("focus-preview-settings");
  localStorage.removeItem("focus-preview-note");
  location.reload();
};
document.querySelector("#size").onchange = (event) => {
  document.querySelector(".window").style.width = `${event.target.value}px`;
};
addEventListener("error", (event) => { document.querySelector("#errors").textContent += event.message; });
addEventListener("unhandledrejection", (event) => { document.querySelector("#errors").textContent += String(event.reason); });
