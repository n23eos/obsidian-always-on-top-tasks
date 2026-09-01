// Чистый парсер/сериализатор строк-задач. Без импорта "obsidian" — покрыт тестами.
//
// Формат строки:
//   - [ ] 🔵 Текст задачи ⏱️ 0:01:23
//   ^индент ^эмодзи-статус       ^время H:MM:SS в хвосте

/** Палитра статусов (канонические формы, с U+FE0F где он есть). */
export const STATUS_EMOJIS: readonly string[] = [
  "⬜", // не начато
  "🔄", // в работе
  "⏸️", // пауза
  "🔜", // отложено
  "⛔", // заблокирована
  "✅", // готово
  "❗", // важно
  "🔴", "🟠", "🟡", "🟢", "🔵", "🟣", // цветные метки
];

const VARIATION_SELECTOR = "️";

export interface ParsedTaskLine {
  indent: string;
  bullet: "-" | "*";
  checked: boolean;
  statusEmoji: string | null;
  text: string;
  elapsedSeconds: number | null;
}

const TASK_RE = /^(\s*)([-*]) \[( |x|X)\] (.*)$/;
// Время строго в хвосте строки: " ⏱ 0:01:23" или легаси " ⏱ 01:23"
const ELAPSED_TAIL_RE = / ⏱️? (\d{1,3}:\d{2}(?::\d{2})?)\s*$/;

/**
 * Палитра из настроек: эмодзи через пробел/перенос строки, дубли убираются.
 * Пустая строка = стандартная палитра.
 */
export function parseStatusPalette(text: string): readonly string[] {
  const unique = [...new Set(text.split(/\s+/).filter((part) => part))];
  return unique.length > 0 ? unique : STATUS_EMOJIS;
}

/** Пробует снять эмодзи-статус из палитры с начала текста. */
function takeStatusEmoji(
  text: string,
  palette: readonly string[],
): { emoji: string | null; rest: string } {
  for (const canonical of palette) {
    const base = canonical.replace(VARIATION_SELECTOR, "");
    if (!text.startsWith(base)) continue;
    let consumed = base.length;
    if (text[consumed] === VARIATION_SELECTOR) consumed += 1;
    const after = text.slice(consumed);
    if (after === "" || after.startsWith(" ")) {
      return { emoji: canonical, rest: after.replace(/^ /, "") };
    }
  }
  return { emoji: null, rest: text };
}

export function parseTaskLine(
  line: string,
  palette: readonly string[] = STATUS_EMOJIS,
): ParsedTaskLine | null {
  const match = line.match(TASK_RE);
  if (!match) return null;

  const [, indent, bullet, checkChar, rawRest] = match;

  let elapsedSeconds: number | null = null;
  let rest = rawRest;
  const elapsedMatch = rest.match(ELAPSED_TAIL_RE);
  if (elapsedMatch) {
    elapsedSeconds = parseDuration(elapsedMatch[1]);
    if (elapsedSeconds !== null) rest = rest.slice(0, elapsedMatch.index);
  }

  const { emoji, rest: text } = takeStatusEmoji(rest, palette);

  return {
    indent,
    bullet: bullet as "-" | "*",
    checked: checkChar !== " ",
    statusEmoji: emoji,
    text,
    elapsedSeconds,
  };
}

function serializeTaskLine(parsed: ParsedTaskLine): string {
  const box = parsed.checked ? "x" : " ";
  const head = `${parsed.indent}${parsed.bullet} [${box}]`;
  const body = [parsed.statusEmoji, parsed.text].filter((part) => part).join(" ");
  const tail =
    parsed.elapsedSeconds === null ? "" : ` ⏱️ ${formatDuration(parsed.elapsedSeconds)}`;
  return `${head} ${body}${tail}`.trimEnd();
}

/** Ставит/заменяет эмодзи-статус; null снимает. Не-задачи возвращает как есть. */
export function withStatusEmoji(
  line: string,
  emoji: string | null,
  palette: readonly string[] = STATUS_EMOJIS,
): string {
  const parsed = parseTaskLine(line, palette);
  if (!parsed) return line;
  return serializeTaskLine({ ...parsed, statusEmoji: emoji });
}

/** Ставит/заменяет накопленное время в хвосте. Не-задачи возвращает как есть. */
export function withElapsed(
  line: string,
  seconds: number,
  palette: readonly string[] = STATUS_EMOJIS,
): string {
  const parsed = parseTaskLine(line, palette);
  if (!parsed) return line;
  return serializeTaskLine({ ...parsed, elapsedSeconds: seconds });
}

/** Секунды → "H:MM:SS" (часы без ведущего нуля). */
export function formatDuration(totalSeconds: number): string {
  const seconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${hours}:${pad(minutes)}:${pad(secs)}`;
}

/** "H:MM:SS" → секунды; легаси "HH:MM" читается как часы:минуты. Мусор → null. */
export function parseDuration(text: string): number | null {
  const parts = text.split(":");
  if (parts.length < 2 || parts.length > 3) return null;
  if (parts.some((part) => !/^\d+$/.test(part))) return null;

  const numbers = parts.map(Number);
  if (parts.length === 3) {
    const [hours, minutes, secs] = numbers;
    return hours * 3600 + minutes * 60 + secs;
  }
  const [hours, minutes] = numbers;
  return hours * 3600 + minutes * 60;
}

/** Срезает YAML frontmatter в начале документа (в overlay он не нужен). */
export function stripFrontmatter(content: string): string {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) return content;
  const match = content.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/);
  return match ? content.slice(match[0].length) : content;
}

/** Ставит/снимает галочку чекбокса. Не-задачи возвращает как есть. */
export function withChecked(
  line: string,
  checked: boolean,
  palette: readonly string[] = STATUS_EMOJIS,
): string {
  const parsed = parseTaskLine(line, palette);
  if (!parsed) return line;
  return serializeTaskLine({ ...parsed, checked });
}

/** Заменяет текст задачи, сохраняя чекбокс, эмодзи и время. */
export function withText(
  line: string,
  text: string,
  palette: readonly string[] = STATUS_EMOJIS,
): string {
  const parsed = parseTaskLine(line, palette);
  if (!parsed) return line;
  return serializeTaskLine({ ...parsed, text });
}
