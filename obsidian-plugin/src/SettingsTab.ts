// Вкладка настроек. Изменения применяются к открытому overlay сразу.

import { App, PluginSettingTab, Setting, normalizePath } from "obsidian";
import type TasksForFocusPlugin from "./main";
import type { OverlayEdge } from "./electron";
import { FocusOverlayView, FOCUS_OVERLAY_VIEW_TYPE } from "./overlay/FocusOverlayView";

export class TasksForFocusSettingsTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: TasksForFocusPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Note to pin")
      .setDesc(
        "Path to the markdown file shown in the overlay. Easier: open the note and run the " +
          "\"Open current note as focus overlay\" command — the path is saved for you.",
      )
      .addText((text) =>
        text
          .setPlaceholder("Focus/today.md")
          .setValue(this.plugin.settings.focusNotePath)
          .onChange(async (value) => {
            const trimmed = value.trim();
            await this.applyPatch({ focusNotePath: trimmed ? normalizePath(trimmed) : "" });
          }),
      );

    new Setting(containerEl)
      .setName("Screen edge")
      .setDesc("Which side of the screen the overlay is docked to.")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ right: "Right", left: "Left" })
          .setValue(this.plugin.settings.edge)
          .onChange(async (value) => {
            await this.applyPatch({ edge: value as OverlayEdge });
          }),
      );

    new Setting(containerEl)
      .setName("Overlay width")
      .setDesc("Width of the overlay window in pixels.")
      .addSlider((slider) =>
        slider
          .setLimits(240, 560, 10)
          .setValue(this.plugin.settings.overlayWidth)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.applyPatch({ overlayWidth: value });
          }),
      );

    new Setting(containerEl)
      .setName("Opacity")
      .setDesc("Lower values let the window behind the overlay show through.")
      .addSlider((slider) =>
        slider
          .setLimits(0.5, 1, 0.05)
          .setValue(this.plugin.settings.opacity)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.applyPatch({ opacity: value });
          }),
      );

    new Setting(containerEl)
      .setName("Breaks")
      .setDesc(
        "Adds a coffee button to the footer: it stops the running task timer and starts a " +
          "break stopwatch. Total break time accumulates in the note as a \"☕ H:MM:SS\" line. " +
          "A long work session also gets a gentle reminder.",
      )
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.breaksEnabled).onChange(async (value) => {
          await this.applyPatch({ breaksEnabled: value });
        }),
      );

    new Setting(containerEl)
      .setName("Remind about a break after (minutes)")
      .setDesc("Length of continuous work after which the reminder appears.")
      .addSlider((slider) =>
        slider
          .setLimits(20, 90, 5)
          .setValue(this.plugin.settings.breakReminderMinutes)
          .setDynamicTooltip()
          .onChange(async (value) => {
            await this.applyPatch({ breakReminderMinutes: value });
          }),
      );

    new Setting(containerEl)
      .setName("Emoji status button")
      .setDesc("Turn off to save space: the status stays visible as text in the task line.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showEmojiButton).onChange(async (value) => {
          await this.applyPatch({ showEmojiButton: value });
        }),
      );

    new Setting(containerEl)
      .setName("Click-through (experimental)")
      .setDesc("The window ignores the mouse entirely, so its buttons stop working. Only this setting can turn it back off.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.clickThrough).onChange(async (value) => {
          await this.applyPatch({ clickThrough: value });
        }),
      );

    new Setting(containerEl)
      .setName("Never take focus (experimental)")
      .setDesc("Uses setFocusable(false), which behaves unreliably on macOS.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.nonFocusable).onChange(async (value) => {
          await this.applyPatch({ nonFocusable: value });
        }),
      );
  }

  private async applyPatch(patch: Partial<typeof this.plugin.settings>): Promise<void> {
    this.plugin.settings = { ...this.plugin.settings, ...patch };
    await this.plugin.saveSettings();
    this.plugin.overlay.applyGeometry();
    for (const leaf of this.app.workspace.getLeavesOfType(FOCUS_OVERLAY_VIEW_TYPE)) {
      if (leaf.view instanceof FocusOverlayView) leaf.view.requestRender();
    }
  }
}
