// Настройки плагина + бегущий таймер (переживает перезапуск Obsidian).

import type { RunningTimer } from "./core/timer";
import type { OverlayEdge, ElectronRect } from "./electron";

/** Край экрана или "free" — окно остаётся там, куда его перетащил пользователь. */
export type DockMode = OverlayEdge | "free";

export interface PluginSettings {
  /** Путь к заметке overlay по умолчанию ("" = не выбрана). */
  focusNotePath: string;
  dockMode: DockMode;
  overlayWidth: number;
  opacity: number;
  /** Размер шрифта overlay в пикселях. */
  fontSize: number;
  /** Последнее положение окна в режиме "free" (null = ещё не сохраняли). */
  freeBounds: ElectronRect | null;
  /** Перерывы: кнопка ☕ в футере и напоминание при долгой сессии. */
  breaksEnabled: boolean;
  /** Через сколько минут непрерывной сессии напомнить о перерыве. */
  breakReminderMinutes: number;
  /** Показывать кнопку эмодзи-статуса в строке задачи. */
  showEmojiButton: boolean;
  /** Своя палитра статусов через пробел ("" = стандартная). */
  statusEmojis: string;
  /** Скрывать сделанные задачи в overlay. */
  hideCompleted: boolean;
  /** Показывать только задачи, без остального markdown. */
  tasksOnly: boolean;
  /** Бегущий таймер в статус-баре главного окна. */
  statusBarTimer: boolean;
  /** Иконка в ribbon для переключения overlay. */
  showRibbonIcon: boolean;
  /** Экспериментально: окно не принимает клики вовсе. */
  clickThrough: boolean;
  /** Экспериментально: окно не берёт фокус (нестабильно на macOS). */
  nonFocusable: boolean;
  /** Единственный бегущий таймер (null = не бежит). */
  runningTimer: RunningTimer | null;
}

export const DEFAULT_SETTINGS: PluginSettings = {
  focusNotePath: "",
  dockMode: "right",
  overlayWidth: 340,
  opacity: 0.95,
  fontSize: 13,
  freeBounds: null,
  breaksEnabled: true,
  breakReminderMinutes: 50,
  showEmojiButton: true,
  statusEmojis: "",
  hideCompleted: false,
  tasksOnly: false,
  statusBarTimer: true,
  showRibbonIcon: true,
  clickThrough: false,
  nonFocusable: false,
  runningTimer: null,
};

export const OVERLAY_MARGIN = 12;

/** Ключи, которые кнопка "Reset to defaults" не трогает. */
const PRESERVED_ON_RESET: readonly (keyof PluginSettings)[] = ["focusNotePath", "runningTimer"];

/**
 * data.json → настройки. Терпит мусор и старые версии: до 0.7.0 край экрана
 * хранился в поле `edge`, теперь это `dockMode`.
 */
export function migrateSettings(stored: unknown): PluginSettings {
  if (!stored || typeof stored !== "object") return { ...DEFAULT_SETTINGS };
  const { edge, ...rest } = stored as Partial<PluginSettings> & { edge?: OverlayEdge };
  const merged: PluginSettings = { ...DEFAULT_SETTINGS, ...rest };
  if (!("dockMode" in rest) && (edge === "left" || edge === "right")) {
    return { ...merged, dockMode: edge };
  }
  return merged;
}

/** Новый объект настроек со значениями по умолчанию; заметка и таймер остаются. */
export function resetToDefaults(current: PluginSettings): PluginSettings {
  const preserved = Object.fromEntries(
    PRESERVED_ON_RESET.map((key) => [key, current[key]]),
  ) as Partial<PluginSettings>;
  return { ...DEFAULT_SETTINGS, ...preserved };
}
