import { parseTaskLine, STATUS_EMOJIS } from "./taskLine";

export interface FocusCandidate {
  lineNo: number;
  lineText: string;
  text: string;
  checked: boolean;
  eligible: boolean;
}

export interface FocusTask {
  lineNo: number;
  lineText: string;
  text: string;
  done: boolean;
  missing: boolean;
}

export interface FocusSession {
  filePath: string;
  tasks: FocusTask[];
  status: "active" | "paused" | "finished";
  startedAt: number;
  activeSince: number | null;
  elapsedMs: number;
  finishedAt: number | null;
}

interface Fence {
  marker: "`" | "~";
  length: number;
}

/** Finds Markdown tasks that can participate in a focus session. */
export function scanFocusTasks(
  content: string,
  palette: readonly string[] = STATUS_EMOJIS,
): FocusCandidate[] {
  const lines = content.split("\n");
  const parsed: Array<Omit<FocusCandidate, "eligible">> = [];
  let inFrontmatter = /^\uFEFF?---\s*$/.test(lines[0] ?? "");
  let fence: Fence | null = null;
  const listIndents: number[] = [];

  for (let lineNo = 0; lineNo < lines.length; lineNo += 1) {
    const rawLineText = lines[lineNo];
    const lineText = rawLineText.endsWith("\r") ? rawLineText.slice(0, -1) : rawLineText;
    if (inFrontmatter) {
      if (lineNo > 0 && /^(?:---|\.\.\.)\s*$/.test(lineText)) inFrontmatter = false;
      continue;
    }

    if (fence) {
      const close = lineText.match(/^ {0,3}(`+|~+)\s*$/);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) {
        fence = null;
      }
      continue;
    }

    const open = lineText.match(/^ {0,3}(`{3,}|~{3,})/);
    if (open) {
      fence = { marker: open[1][0] as "`" | "~", length: open[1].length };
      continue;
    }

    const listItem = lineText.match(/^([ \t]*)(?:[-*+]|\d+[.)])(?:[ \t]+|$)/);
    const indent = indentationWidth(listItem?.[1] ?? lineText.match(/^[ \t]*/)?.[0] ?? "");
    let hasListParent = false;
    if (listItem) {
      while (listIndents.length > 0 && listIndents[listIndents.length - 1] >= indent) {
        listIndents.pop();
      }
      hasListParent = listIndents.length > 0;
      if (indent >= 4 && !hasListParent) continue;
      listIndents.push(indent);
    } else if (lineText.trim()) {
      while (listIndents.length > 0 && listIndents[listIndents.length - 1] >= indent) {
        listIndents.pop();
      }
    }

    const task = parseTaskLine(lineText, palette);
    if (!task) continue;
    parsed.push({
      lineNo,
      lineText: rawLineText,
      text: normalizeTitle(task.text),
      checked: task.checked,
    });
  }

  const counts = new Map<string, number>();
  for (const task of parsed) counts.set(task.text, (counts.get(task.text) ?? 0) + 1);
  return parsed.map((task) => ({
    ...task,
    eligible: !task.checked && task.text.length > 0 && counts.get(task.text) === 1,
  }));
}

/** Returns active session wall time in whole seconds. */
export function elapsedSessionSeconds(session: FocusSession, now = Date.now()): number {
  const runningMs = session.status === "active" && session.activeSince !== null
    ? Math.max(0, now - session.activeSince)
    : 0;
  return Math.max(0, Math.floor((session.elapsedMs + runningMs) / 1000));
}

/** Reconciles selected snapshots with the current note without guessing renames. */
export function reconcileFocusSession(
  session: FocusSession,
  content: string,
  palette: readonly string[] = STATUS_EMOJIS,
): FocusSession {
  if (session.status === "finished") return session;
  const candidates = scanFocusTasks(content, palette);
  const byTitle = new Map<string, FocusCandidate[]>();
  for (const candidate of candidates) {
    const matching = byTitle.get(candidate.text) ?? [];
    matching.push(candidate);
    byTitle.set(candidate.text, matching);
  }

  let changed = false;
  const tasks = session.tasks.map((task) => {
    const matches = byTitle.get(task.text) ?? [];
    if (matches.length !== 1) {
      if (task.missing && !task.done) return task;
      changed = true;
      return { ...task, done: false, missing: true };
    }
    const match = matches[0];
    const next: FocusTask = {
      lineNo: match.lineNo,
      lineText: match.lineText,
      text: match.text,
      done: match.checked,
      missing: false,
    };
    if (!sameTask(task, next)) changed = true;
    return next;
  });
  return changed ? { ...session, tasks } : session;
}

/** Applies a known successful inline edit to one selected task snapshot. */
export function reanchorFocusSessionTask(
  session: FocusSession,
  filePath: string,
  lineNo: number,
  oldLine: string,
  newLine: string,
  palette: readonly string[] = STATUS_EMOJIS,
): FocusSession {
  if (session.status === "finished" || session.filePath !== filePath) return session;
  const oldTask = parseTaskLine(oldLine, palette);
  const newTask = parseTaskLine(newLine, palette);
  if (!oldTask || !newTask) return session;
  const oldTitle = normalizeTitle(oldTask.text);
  const newTitle = normalizeTitle(newTask.text);
  if (!newTitle) return session;

  const exactIndex = session.tasks.findIndex((task) =>
    task.lineNo === lineNo && (task.lineText === oldLine || task.text === oldTitle));
  const titleMatches = session.tasks
    .map((task, index) => ({ task, index }))
    .filter(({ task }) => task.text === oldTitle);
  const index = exactIndex >= 0 ? exactIndex : titleMatches.length === 1 ? titleMatches[0].index : -1;
  if (index < 0) return session;

  const tasks = [...session.tasks];
  tasks[index] = {
    lineNo,
    lineText: newLine,
    text: newTitle,
    done: newTask.checked,
    missing: false,
  };
  return { ...session, tasks };
}

/** Validates persisted state and fills fields introduced by the first release. */
export function migrateFocusSession(value: unknown): FocusSession | null {
  if (!isRecord(value) || typeof value.filePath !== "string" || value.filePath.length === 0) {
    return null;
  }
  if (!Array.isArray(value.tasks) || value.tasks.length < 1 || value.tasks.length > 20) {
    return null;
  }
  if (value.status !== "active" && value.status !== "paused" && value.status !== "finished") {
    return null;
  }
  if (!isTimestamp(value.startedAt) || !isDuration(value.elapsedMs)) return null;
  if (value.status === "active" && !isTimestamp(value.activeSince)) return null;
  if (value.status !== "active" && value.activeSince !== null) return null;
  if (value.finishedAt !== null && value.finishedAt !== undefined && !isTimestamp(value.finishedAt)) {
    return null;
  }
  if (value.status === "finished" && !isTimestamp(value.finishedAt)) return null;

  const tasks: FocusTask[] = [];
  for (const rawTask of value.tasks) {
    if (!isRecord(rawTask)
      || !Number.isInteger(rawTask.lineNo)
      || (rawTask.lineNo as number) < 0
      || typeof rawTask.lineText !== "string"
      || typeof rawTask.text !== "string"
      || rawTask.text.length === 0
      || typeof rawTask.done !== "boolean"
      || (rawTask.missing !== undefined && typeof rawTask.missing !== "boolean")) {
      return null;
    }
    tasks.push({
      lineNo: rawTask.lineNo as number,
      lineText: rawTask.lineText,
      text: rawTask.text,
      done: rawTask.done,
      missing: rawTask.missing === true,
    });
  }

  return {
    filePath: value.filePath,
    tasks,
    status: value.status,
    startedAt: value.startedAt,
    activeSince: value.status === "active" ? value.activeSince as number : null,
    elapsedMs: value.elapsedMs,
    finishedAt: value.finishedAt === undefined ? null : value.finishedAt,
  };
}

function normalizeTitle(text: string): string {
  return text.trim();
}

function indentationWidth(indent: string): number {
  let width = 0;
  for (const character of indent) width += character === "\t" ? 4 : 1;
  return width;
}

function sameTask(left: FocusTask, right: FocusTask): boolean {
  return left.lineNo === right.lineNo
    && left.lineText === right.lineText
    && left.text === right.text
    && left.done === right.done
    && left.missing === right.missing;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object";
}

function isTimestamp(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0;
}

function isDuration(value: unknown): value is number {
  return isTimestamp(value);
}
