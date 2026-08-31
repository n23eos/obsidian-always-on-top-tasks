// Вкладка настроек. Изменения применяются к открытому overlay сразу.

import { App, PluginSettingTab, Setting } from "obsidian";
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
      .setName("Заметка для overlay")
      .setDesc("Путь к .md-файлу. Проще: открой заметку и выполни команду «Open current note as focus overlay» — путь сохранится сам.")
      .addText((text) =>
        text
          .setPlaceholder("Focus/today.md")
          .setValue(this.plugin.settings.focusNotePath)
          .onChange(async (value) => {
            await this.applyPatch({ focusNotePath: value.trim() });
          }),
      );

    new Setting(containerEl)
      .setName("Край экрана")
      .addDropdown((dropdown) =>
        dropdown
          .addOptions({ right: "Правый", left: "Левый" })
          .setValue(this.plugin.settings.edge)
          .onChange(async (value) => {
            await this.applyPatch({ edge: value as OverlayEdge });
          }),
      );

    new Setting(containerEl)
      .setName("Ширина окна")
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
      .setName("Непрозрачность")
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
      .setName("Перерывы")
      .setDesc("Кнопка ☕ в футере (стопит таймер задачи, считает отдых) и мягкое напоминание при долгой сессии. Суммарное время перерывов копится в заметке строкой «☕ Ч:ММ:СС».")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.breaksEnabled).onChange(async (value) => {
          await this.applyPatch({ breaksEnabled: value });
        }),
      );

    new Setting(containerEl)
      .setName("Напоминать о перерыве через (минут)")
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
      .setName("Кнопка статуса-эмодзи")
      .setDesc("Выключи, если занимает место: статус останется видимым текстом в строке.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.showEmojiButton).onChange(async (value) => {
          await this.applyPatch({ showEmojiButton: value });
        }),
      );

    new Setting(containerEl)
      .setName("Сквозные клики (экспериментально)")
      .setDesc("Окно игнорирует мышь целиком — кнопки перестанут работать. Выключить можно только здесь.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.clickThrough).onChange(async (value) => {
          await this.applyPatch({ clickThrough: value });
        }),
      );

    new Setting(containerEl)
      .setName("Не забирать фокус (экспериментально)")
      .setDesc("setFocusable(false): на macOS ведёт себя нестабильно.")
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
