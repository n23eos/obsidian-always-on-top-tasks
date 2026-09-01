import { Plugin, TFile } from "obsidian";
import { OverlayController } from "./overlay/OverlayController";
import { FocusOverlayView, FOCUS_OVERLAY_VIEW_TYPE } from "./overlay/FocusOverlayView";
import { TimerService } from "./TimerService";
import { StatusBarTimer } from "./StatusBarTimer";
import { TasksForFocusSettingsTab } from "./SettingsTab";
import { DEFAULT_SETTINGS, migrateSettings, type PluginSettings } from "./settings";
import { notify } from "./notify";

const STATUS_BAR_TICK_MS = 1000;

export default class TasksForFocusPlugin extends Plugin {
  settings: PluginSettings = DEFAULT_SETTINGS;
  overlay: OverlayController = new OverlayController(this);
  timers: TimerService = new TimerService(this);
  statusBar: StatusBarTimer = new StatusBarTimer(this);
  private ribbonEl: HTMLElement | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(FOCUS_OVERLAY_VIEW_TYPE, (leaf) => new FocusOverlayView(leaf, this));
    this.addSettingTab(new TasksForFocusSettingsTab(this.app, this));
    this.syncRibbon();
    this.statusBar.sync();
    this.registerInterval(window.setInterval(() => this.statusBar.tick(), STATUS_BAR_TICK_MS));

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

    this.addCommand({
      id: "toggle-always-on-top",
      name: "Toggle always on top",
      checkCallback: (checking) => {
        if (!this.overlay.isOpen) return false;
        if (!checking) {
          this.overlay.togglePin();
          this.refreshOverlayViews();
        }
        return true;
      },
    });

    this.addCommand({
      id: "stop-running-timer",
      name: "Stop the running timer",
      checkCallback: (checking) => {
        if (!this.settings.runningTimer) return false;
        if (!checking) void this.stopRunningTimer();
        return true;
      },
    });

    this.addCommand({
      id: "toggle-completed-tasks",
      name: "Toggle completed tasks in the overlay",
      callback: () => void this.updateSettings({ hideCompleted: !this.settings.hideCompleted }),
    });
  }

  onunload(): void {
    // Гайдлайн Obsidian: плагин не закрывает leaf'ы в onunload. Снимаем только
    // always-on-top, окно превращается в обычный popout.
    this.overlay.release();
  }

  async toggleOverlay(): Promise<void> {
    if (this.overlay.isOpen) {
      this.overlay.close();
      return;
    }
    const file = this.resolveFocusNote();
    if (!file) {
      notify(
        'no note selected. Open the note you want and run the "Open current note as focus overlay" command.',
      );
      return;
    }
    await this.overlay.toggle(file);
  }

  /** Стоп из статус-бара или команды: overlay перерисуется по событию modify. */
  async stopRunningTimer(): Promise<void> {
    await this.timers.stop();
    this.statusBar.tick();
    this.refreshOverlayViews();
  }

  private async openCurrentNote(): Promise<void> {
    const file = this.app.workspace.getActiveFile();
    if (!file) {
      notify("no active note.");
      return;
    }
    await this.patchSettings({ focusNotePath: file.path });
    if (this.overlay.isOpen) this.overlay.close();
    await this.overlay.toggle(file);
  }

  /** Заметка из настроек; нет — активная. */
  private resolveFocusNote(): TFile | null {
    const byPath = this.app.vault.getAbstractFileByPath(this.settings.focusNotePath);
    if (byPath instanceof TFile) return byPath;
    return this.app.workspace.getActiveFile();
  }

  private syncRibbon(): void {
    const wanted = this.settings.showRibbonIcon;
    if (wanted && !this.ribbonEl) {
      this.ribbonEl = this.addRibbonIcon("target", "Toggle focus overlay", () => {
        void this.toggleOverlay();
      });
    } else if (!wanted && this.ribbonEl) {
      this.ribbonEl.remove();
      this.ribbonEl = null;
    }
  }

  refreshOverlayViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(FOCUS_OVERLAY_VIEW_TYPE)) {
      if (leaf.view instanceof FocusOverlayView) leaf.view.requestRender();
    }
  }

  async loadSettings(): Promise<void> {
    // loadData() отдаёт any: миграция сужает его до настроек и терпит мусор.
    this.settings = migrateSettings(await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  /** Только сохранить (таймер, положение окна) — без перерисовки. */
  async patchSettings(patch: Partial<PluginSettings>): Promise<void> {
    this.settings = { ...this.settings, ...patch };
    await this.saveSettings();
  }

  /** Сохранить и применить везде: окно, вью, статус-бар, ribbon. */
  async updateSettings(patch: Partial<PluginSettings>): Promise<void> {
    await this.patchSettings(patch);
    this.overlay.applyGeometry();
    this.refreshOverlayViews();
    this.statusBar.sync();
    this.syncRibbon();
  }
}
