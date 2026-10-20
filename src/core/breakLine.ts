// Суммарное время перерывов хранится в заметке отдельной строкой: "☕ Ч:ММ:СС".
// Чистые функции без импорта "obsidian" — покрыты тестами.

import { formatDuration, parseDuration } from "./taskLine";

// Строго вся строка: эмодзи чашки (с/без U+FE0F) + длительность.
const BREAK_LINE_RE = /^☕️? (\d{1,3}:\d{2}(?::\d{2})?)\s*$/;

export interface BreakCommitJournal {
  lineNo: number | null;
  beforeTotalSeconds: number | null;
  afterTotalSeconds: number;
}

export interface PersistedBreak {
  filePath: string;
  startedAt: number;
  stoppedAt?: number;
  commit?: BreakCommitJournal;
}

export interface BreakCommitResult {
  kind: "ok" | "already-committed" | "ambiguous";
  content: string;
}

/** Секунды из строки перерывов, null = это не строка перерывов. */
export function parseBreakLine(line: string): number | null {
  const match = line.match(BREAK_LINE_RE);
  if (!match) return null;
  return parseDuration(match[1]);
}

/**
 * Добавляет секунды к строке "☕ …" (первой найденной);
 * нет строки — дописывает в конец, сохраняя стиль хвостового \n.
 */
export function addBreakTime(content: string, seconds: number): string {
  const lines = content.split("\n");
  const index = lines.findIndex((line) => parseBreakLine(line) !== null);

  if (index !== -1) {
    const total = (parseBreakLine(lines[index]) ?? 0) + seconds;
    return lines
      .map((line, i) => (i === index ? `☕ ${formatDuration(total)}` : line))
      .join("\n");
  }

  const breakLine = `☕ ${formatDuration(seconds)}`;
  if (content.trim() === "") return `${breakLine}\n`;
  return content.endsWith("\n") ? `${content}${breakLine}\n` : `${content}\n${breakLine}`;
}

/** Captures the only safe aggregate transition before changing the note. */
export function prepareBreakCommit(
  content: string,
  seconds: number,
): BreakCommitJournal | null {
  const matches = breakTotals(content);
  if (matches.length > 1) return null;
  const current = matches[0];
  return {
    lineNo: current?.lineNo ?? null,
    beforeTotalSeconds: current?.totalSeconds ?? null,
    afterTotalSeconds: (current?.totalSeconds ?? 0) + seconds,
  };
}

/** Applies a persisted transition once, or refuses a changed aggregate. */
export function commitBreakTime(
  content: string,
  journal: BreakCommitJournal,
): BreakCommitResult {
  const matches = breakTotals(content);
  if (matches.length > 1) return { kind: "ambiguous", content };
  const current = matches[0];

  if (journal.beforeTotalSeconds === null) {
    if (!current) {
      return { kind: "ok", content: addBreakTime(content, journal.afterTotalSeconds) };
    }
    return current.totalSeconds === journal.afterTotalSeconds
      ? { kind: "already-committed", content }
      : { kind: "ambiguous", content };
  }

  if (!current) return { kind: "ambiguous", content };
  if (current.totalSeconds === journal.afterTotalSeconds) {
    return { kind: "already-committed", content };
  }
  if (current.totalSeconds !== journal.beforeTotalSeconds) {
    return { kind: "ambiguous", content };
  }

  const lines = content.split("\n");
  lines[current.lineNo] = `☕ ${formatDuration(journal.afterTotalSeconds)}`;
  return { kind: "ok", content: lines.join("\n") };
}

function breakTotals(content: string): Array<{ lineNo: number; totalSeconds: number }> {
  const matches: Array<{ lineNo: number; totalSeconds: number }> = [];
  for (const [lineNo, line] of content.split("\n").entries()) {
    const totalSeconds = parseBreakLine(line);
    if (totalSeconds !== null) matches.push({ lineNo, totalSeconds });
  }
  return matches;
}
