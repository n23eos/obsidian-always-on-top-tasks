// Настройки плагина + бегущий таймер (переживает перезапуск Obsidian).

import type { RunningTimer } from "./core/timer";
import type { BreakCommitJournal, PersistedBreak } from "./core/breakLine";
import { migrateFocusSession, type FocusSession } from "./core/focusSession";
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
  /** Активный или ожидающий безопасной записи перерыв. */
  breakTimer: PersistedBreak | null;
  /** Текущая или последняя завершённая фокус-сессия. */
  focusSession: FocusSession | null;
  /** Показывать и разрешать фокус-сессии. */
  focusSessionsEnabled: boolean;
  /** Предпочтительное число задач при создании фокус-сессии. */
  focusTaskGoal: number;
  /** Показывать только выбранные задачи во время фокус-сессии. */
  focusOnly: boolean;
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
  breakTimer: null,
  focusSession: null,
  focusSessionsEnabled: true,
  focusTaskGoal: 3,
  focusOnly: true,
};

export const OVERLAY_MARGIN = 12;

/** Ключи, которые кнопка "Reset to defaults" не трогает. */
const PRESERVED_ON_RESET: readonly (keyof PluginSettings)[] = [
  "focusNotePath",
  "runningTimer",
  "breakTimer",
  "focusSession",
];

/**
 * data.json → настройки. Терпит мусор и старые версии: до 0.7.0 край экрана
 * хранился в поле `edge`, теперь это `dockMode`.
 */
export function migrateSettings(stored: unknown): PluginSettings {
  if (!stored || typeof stored !== "object") return { ...DEFAULT_SETTINGS };
  const { edge, ...rest } = stored as Partial<PluginSettings> & { edge?: OverlayEdge };
  const merged: PluginSettings = {
    ...DEFAULT_SETTINGS,
    ...rest,
    breakTimer: migrateBreakTimer(rest.breakTimer),
    focusSession: migrateFocusSession(rest.focusSession),
    focusSessionsEnabled: typeof rest.focusSessionsEnabled === "boolean"
      ? rest.focusSessionsEnabled
      : DEFAULT_SETTINGS.focusSessionsEnabled,
    focusTaskGoal: isFocusTaskGoal(rest.focusTaskGoal)
      ? rest.focusTaskGoal
      : DEFAULT_SETTINGS.focusTaskGoal,
    focusOnly: typeof rest.focusOnly === "boolean"
      ? rest.focusOnly
      : DEFAULT_SETTINGS.focusOnly,
  };
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

function isFocusTaskGoal(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 1 && (value as number) <= 20;
}

function migrateBreakTimer(value: unknown): PersistedBreak | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<PersistedBreak>;
  if (typeof raw.filePath !== "string" || raw.filePath.trim() === "") return null;
  if (!isNonNegativeInteger(raw.startedAt)) return null;
  if (raw.stoppedAt === undefined) {
    if (raw.commit !== undefined) return null;
    return { filePath: raw.filePath, startedAt: raw.startedAt };
  }
  if (!isNonNegativeInteger(raw.stoppedAt) || raw.stoppedAt < raw.startedAt) return null;
  if (raw.commit === undefined) {
    return {
      filePath: raw.filePath,
      startedAt: raw.startedAt,
      stoppedAt: raw.stoppedAt,
    };
  }
  const seconds = Math.floor((raw.stoppedAt - raw.startedAt) / 1000);
  const commit = migrateBreakCommit(raw.commit, seconds);
  if (!commit) return null;
  return {
    filePath: raw.filePath,
    startedAt: raw.startedAt,
    stoppedAt: raw.stoppedAt,
    commit,
  };
}

function migrateBreakCommit(value: unknown, seconds: number): BreakCommitJournal | null {
  if (!value || typeof value !== "object") return null;
  const raw = value as Partial<BreakCommitJournal>;
  if (!isNonNegativeInteger(raw.afterTotalSeconds)) return null;
  if (raw.beforeTotalSeconds === null) {
    if (raw.lineNo !== null || raw.afterTotalSeconds !== seconds) return null;
    return {
      lineNo: null,
      beforeTotalSeconds: null,
      afterTotalSeconds: raw.afterTotalSeconds,
    };
  }
  if (!isNonNegativeInteger(raw.beforeTotalSeconds) || !isNonNegativeInteger(raw.lineNo)) {
    return null;
  }
  if (raw.afterTotalSeconds !== raw.beforeTotalSeconds + seconds) return null;
  return {
    lineNo: raw.lineNo,
    beforeTotalSeconds: raw.beforeTotalSeconds,
    afterTotalSeconds: raw.afterTotalSeconds,
  };
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}
