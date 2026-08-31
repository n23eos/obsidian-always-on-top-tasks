// Суммарное время перерывов хранится в заметке отдельной строкой: "☕ Ч:ММ:СС".
// Чистые функции без импорта "obsidian" — покрыты тестами.

import { formatDuration, parseDuration } from "./taskLine";

// Строго вся строка: эмодзи чашки (с/без U+FE0F) + длительность.
const BREAK_LINE_RE = /^☕️? (\d{1,3}:\d{2}(?::\d{2})?)\s*$/;

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
