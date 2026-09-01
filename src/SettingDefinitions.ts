// Единый список настроек. Obsidian 1.13+ рисует и индексирует его сам через
// getSettingDefinitions(); для старых версий тот же список рисует адаптер в
// SettingsTab.display(). Так настройки описаны один раз.

import type { SettingDefinitionItem } from "obsidian";
import { STATUS_EMOJIS } from "./core/taskLine";
import type { PluginSettings } from "./settings";

export type SettingKey = keyof PluginSettings;

/** Ключи, от которых зависит видимость других строк: после смены вкладка перерисовывается. */
export const VISIBILITY_KEYS: readonly SettingKey[] = ["breaksEnabled", "dockMode"];

export interface DefinitionContext {
  settings: () => PluginSettings;
  resetToDefaults: () => void;
}

export function buildSettingDefinitions(ctx: DefinitionContext): SettingDefinitionItem<SettingKey>[] {
  return [
    {
      type: "group",
      heading: "Overlay window",
      items: [
        {
          name: "Note to pin",
          desc:
            "The markdown file shown in the overlay. Easier: open the note and run the " +
            '"Open current note as focus overlay" command — the path is saved for you.',
          aliases: ["overlay note", "focus note"],
          control: { type: "file", key: "focusNotePath", placeholder: "Focus/today.md" },
        },
        {
          name: "Position",
          desc: "Dock the overlay to a screen edge, or leave it wherever you drag it.",
          aliases: ["edge", "dock", "side"],
          control: {
            type: "dropdown",
            key: "dockMode",
            options: { right: "Right edge", left: "Left edge", free: "Free (remember where I put it)" },
          },
        },
        {
          name: "Overlay width",
          desc: "Width of the docked overlay window in pixels.",
          visible: () => ctx.settings().dockMode !== "free",
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
      ],
    },
    {
      type: "group",
      heading: "Timer and breaks",
      items: [
        {
          name: "Timer in the status bar",
          desc: "Shows the running task and its time in the main window's status bar. Click it to stop the timer.",
          aliases: ["statusbar"],
          control: { type: "toggle", key: "statusBarTimer" },
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
          name: "Remind about a break after",
          desc: "Length of continuous work after which the reminder appears.",
          visible: () => ctx.settings().breaksEnabled,
          control: {
            type: "slider",
            key: "breakReminderMinutes",
            min: 20,
            max: 90,
            step: 5,
            displayFormat: (value) => `${value} min`,
          },
        },
      ],
    },
    {
      type: "group",
      heading: "Appearance",
      items: [
        {
          name: "Font size",
          desc: "Text size inside the overlay.",
          control: {
            type: "slider",
            key: "fontSize",
            min: 11,
            max: 18,
            step: 1,
            displayFormat: (value) => `${value} px`,
          },
        },
        {
          name: "Hide completed tasks",
          desc: "Checked tasks disappear from the overlay. The eye button in the overlay header toggles this too.",
          aliases: ["done", "finished"],
          control: { type: "toggle", key: "hideCompleted" },
        },
        {
          name: "Tasks only",
          desc: "Skip headings, paragraphs and other markdown between the tasks.",
          control: { type: "toggle", key: "tasksOnly" },
        },
        {
          name: "Emoji status button",
          desc: "Turn off to save space: the status stays visible as text in the task line.",
          control: { type: "toggle", key: "showEmojiButton" },
        },
        {
          name: "Status emojis",
          desc: "Your own palette, separated by spaces. Leave empty for the default one.",
          aliases: ["palette", "labels"],
          control: { type: "text", key: "statusEmojis", placeholder: STATUS_EMOJIS.join(" ") },
        },
        {
          name: "Ribbon icon",
          desc: "Show a target icon in the left ribbon that toggles the overlay.",
          control: { type: "toggle", key: "showRibbonIcon" },
        },
      ],
    },
    {
      type: "group",
      heading: "Advanced",
      items: [
        {
          name: "Click-through (experimental)",
          desc:
            "The window ignores the mouse entirely, so its buttons stop working. " +
            "Only this setting can turn it back off.",
          control: { type: "toggle", key: "clickThrough" },
        },
        {
          name: "Never take focus (experimental)",
          desc: "Asks Electron never to focus the window, which behaves unreliably on macOS.",
          control: { type: "toggle", key: "nonFocusable" },
        },
        {
          name: "Reset to defaults",
          desc: "Restores every setting above. The pinned note and a running timer are kept.",
          action: () => ctx.resetToDefaults(),
        },
      ],
    },
  ];
}
