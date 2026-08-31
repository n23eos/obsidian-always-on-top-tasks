// Настройки плагина + бегущий таймер (переживает перезапуск Obsidian).

import type { RunningTimer } from "./core/timer";
import type { OverlayEdge } from "./electron";

export interface PluginSettings {
  /** Путь к заметке overlay по умолчанию ("" = не выбрана). */
  focusNotePath: string;
  edge: OverlayEdge;
  overlayWidth: number;
  opacity: number;
  /** Перерывы: кнопка ☕ в футере и напоминание при долгой сессии. */
  breaksEnabled: boolean;
  /** Через сколько минут непрерывной сессии напомнить о перерыве. */
  breakReminderMinutes: number;
  /** Показывать кнопку эмодзи-статуса в строке задачи. */
  showEmojiButton: boolean;
  /** Экспериментально: окно не принимает клики вовсе. */
  clickThrough: boolean;
  /** Экспериментально: окно не берёт фокус (нестабильно на macOS). */
  nonFocusable: boolean;
  /** Единственный бегущий таймер (null = не бежит). */
  runningTimer: RunningTimer | null;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  focusNotePath: "",
  edge: "right",
  overlayWidth: 340,
  opacity: 0.95,
  breaksEnabled: true,
  breakReminderMinutes: 50,
  showEmojiButton: true,
  clickThrough: false,
  nonFocusable: false,
  runningTimer: null,
};

export const OVERLAY_MARGIN = 12;
