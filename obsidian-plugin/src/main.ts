import { Notice, Plugin, TFile } from "obsidian";
import { OverlayController } from "./overlay/OverlayController";
import { FocusOverlayView, FOCUS_OVERLAY_VIEW_TYPE } from "./overlay/FocusOverlayView";
import { TimerService } from "./TimerService";
import { TasksForFocusSettingsTab } from "./SettingsTab";
import { DEFAULT_SETTINGS, type PluginSettings } from "./settings";

export default class TasksForFocusPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  overlay: OverlayController = new OverlayController(this);
  timers: TimerService = new TimerService(this);

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(FOCUS_OVERLAY_VIEW_TYPE, (leaf) => new FocusOverlayView(leaf, this));
    this.addSettingTab(new TasksForFocusSettingsTab(this.app, this));

    this.addCommand({
      id: "toggle-focus-overlay",
      name: "Toggle focus overlay",
      callback: () => void this.toggleOverlay(),
    });

    this.addCommand({
      id: "open-current-note-as-overlay",
      name: "Open current note as focus overlay",
      callback: () => void this.openCurrentNote(),
    });
  }

  onunload(): void {
    // Гайдлайн Obsidian: плагин не закрывает leaf'ы в onunload. Снимаем только
    // always-on-top, окно превращается в обычный popout.
    this.overlay.release();
  }

  private async toggleOverlay(): Promise<void> {
    if (this.overlay.isOpen) {
      this.overlay.close();
      return;
    }
    const file = this.resolveFocusNote();
    if (!file) {
      new Notice(
        "Always-on-Top Tasks: no note selected. Open the note you want and run the " +
          "\"Open current note as focus overlay\" command.",
      );
      return;
    }
    await this.overlay.toggle(file);
  }

  private async openCurrentNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      new Notice("Always-on-Top Tasks: no active note.");
      return;
    }
    this.settings = { ...this.settings, focusNotePath: file.path };
    await this.saveSettings();
    if (this.overlay.isOpen) this.overlay.close();
    await this.overlay.toggle(file);
  }

  /** Заметка из настроек; нет — активная. */
  private resolveFocusNote(): TFile | null {
    const byPath = this.app.vault.getAbstractFileByPath(this.settings.focusNotePath);
    if (byPath instanceof TFile) return byPath;
    return this.app.workspace.getActiveFile();
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
