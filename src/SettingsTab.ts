// Вкладка настроек на декларативном API (Obsidian 1.13+): вместо ручного
// display() отдаём описания настроек, и Obsidian сам их рисует и индексирует
// поиском настроек. Изменения применяются к открытому overlay сразу.

import { App, PluginSettingTab, type SettingDefinitionItem } from "obsidian";
import type TasksForFocusPlugin from "./main";
import type { PluginSettings } from "./settings";
import { FocusOverlayView, FOCUS_OVERLAY_VIEW_TYPE } from "./overlay/FocusOverlayView";

export class TasksForFocusSettingsTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: TasksForFocusPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return [
      {
        name: "Note to pin",
        desc:
          "The markdown file shown in the overlay. Easier: open the note and run the " +
          '"Open current note as focus overlay" command — the path is saved for you.',
        aliases: ["overlay note", "focus note"],
        control: {
          type: "file",
          key: "focusNotePath",
          placeholder: "Focus/today.md",
        },
      },
      {
        name: "Screen edge",
        desc: "Which side of the screen the overlay is docked to.",
        control: {
          type: "dropdown",
          key: "edge",
          options: { right: "Right", left: "Left" },
        },
      },
      {
        name: "Overlay width",
        desc: "Width of the overlay window in pixels.",
        control: {
          type: "slider",
          key: "overlayWidth",
          min: 240,
          max: 560,
          step: 10,
          displayFormat: (value) => `${value} px`,
        },
      },
      {
        name: "Opacity",
        desc: "Lower values let the window behind the overlay show through.",
        control: {
          type: "slider",
          key: "opacity",
          min: 0.5,
          max: 1,
          step: 0.05,
          displayFormat: (value) => `${Math.round(value * 100)}%`,
        },
      },
      {
        name: "Breaks",
        desc:
          "Adds a coffee button to the footer: it stops the running task timer and starts a " +
          'break stopwatch. Total break time accumulates in the note as a "☕ H:MM:SS" line. ' +
          "A long work session also gets a gentle reminder.",
        aliases: ["pause", "rest", "pomodoro"],
        control: { type: "toggle", key: "breaksEnabled" },
      },
      {
        name: "Remind about a break after (minutes)",
        desc: "Length of continuous work after which the reminder appears.",
        // Без перерывов настройка бессмысленна — прячем вместе с ними.
        visible: () => this.plugin.settings.breaksEnabled,
        control: {
          type: "slider",
          key: "breakReminderMinutes",
          min: 20,
          max: 90,
          step: 5,
          displayFormat: (value) => `${value} min`,
        },
      },
      {
        name: "Emoji status button",
        desc: "Turn off to save space: the status stays visible as text in the task line.",
        control: { type: "toggle", key: "showEmojiButton" },
      },
      {
        name: "Click-through (experimental)",
        desc:
          "The window ignores the mouse entirely, so its buttons stop working. " +
          "Only this setting can turn it back off.",
        control: { type: "toggle", key: "clickThrough" },
      },
      {
        name: "Never take focus (experimental)",
        desc: "Uses setFocusable(false), which behaves unreliably on macOS.",
        control: { type: "toggle", key: "nonFocusable" },
      },
    ];
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof PluginSettings];
  }

  /** Настройки иммутабельны: собираем новый объект и сразу применяем к overlay. */
  async setControlValue(key: string, value: unknown): Promise<void> {
    this.plugin.settings = { ...this.plugin.settings, [key]: value };
    await this.plugin.saveSettings();
    this.plugin.overlay.applyGeometry();
    for (const leaf of this.app.workspace.getLeavesOfType(FOCUS_OVERLAY_VIEW_TYPE)) {
      if (leaf.view instanceof FocusOverlayView) leaf.view.requestRender();
    }
    // Перерисовать саму вкладку: у слайдера перерывов условная видимость.
    this.update();
  }
}
