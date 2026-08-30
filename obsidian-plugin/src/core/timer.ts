// Чистая логика сессии таймера. Без импорта "obsidian" — покрыта тестами.
//
// Адресация строки: сначала сохранённый номер (проверка точным текстом),
// потом поиск по точному тексту. 0 или ≥2 совпадений = не пишем молча.

import { parseTaskLine, withElapsed } from "./taskLine";

/** Сессия дольше 2ч — вероятно, забытый таймер: пишем, но предупреждаем. */
export const LONG_SESSION_THRESHOLD_SECONDS = 2 * 3600;

export interface RunningTimer {
  filePath: string;
  lineNo: number;
  lineText: string;
  startedAt: number; // epoch ms
}

export interface CommitResult {
  kind: "ok" | "not-found" | "ambiguous";
  /** Новое содержимое файла (только при kind === "ok"). */
  content?: string;
  /** Новый текст строки — для перепривязки бегущего таймера. */
  newLineText?: string;
  /** Номер строки, в которую записали. */
  lineNo?: number;
  sessionSeconds: number;
  isLongSession: boolean;
}

/** Ищет строку по номеру с верификацией текстом, потом по точному тексту.
 *  null = не нашли или нашли неоднозначно. */
export function locateLine(
  lines: readonly string[],
  lineNo: number,
  lineText: string,
): number | null {
  if (lines[lineNo] === lineText) return lineNo;

  const matches = lines.reduce<number[]>((found, line, index) => {
    return line === lineText ? [...found, index] : found;
  }, []);
  return matches.length === 1 ? matches[0] : null;
}

/** Ищет строку бегущего таймера. */
export function locateTimerLine(lines: readonly string[], timer: RunningTimer): number | null {
  return locateLine(lines, timer.lineNo, timer.lineText);
}

/** Останавливает сессию: возвращает новое содержимое файла с добавленным временем. */
export function commitSession(content: string, timer: RunningTimer, nowMs: number): CommitResult {
  const sessionSeconds = Math.max(0, Math.floor((nowMs - timer.startedAt) / 1000));
  const isLongSession = sessionSeconds > LONG_SESSION_THRESHOLD_SECONDS;

  const lines = content.split("\n");
  const lineNo = locateTimerLine(lines, timer);
  if (lineNo === null) {
    const exists = lines.some((line) => line === timer.lineText);
    return { kind: exists ? "ambiguous" : "not-found", sessionSeconds, isLongSession };
  }

  const previousSeconds = parseTaskLine(lines[lineNo])?.elapsedSeconds ?? 0;
  const newLineText = withElapsed(lines[lineNo], previousSeconds + sessionSeconds);
  const newLines = lines.map((line, index) => (index === lineNo ? newLineText : line));

  return {
    kind: "ok",
    content: newLines.join("\n"),
    newLineText,
    lineNo,
    sessionSeconds,
    isLongSession,
  };
}
