import { scanFocusTasks } from "./focusSession";
import { parseTaskLine } from "./taskLine";
import { scanListBranches } from "./taskTree";
import { locateLine } from "./timer";

/** Inserts a new unchecked task as the first child of an exact task anchor. */
export function insertSubtask(
  content: string,
  lineNo: number,
  expectedLine: string,
  text: string,
  palette?: readonly string[],
): string {
  if (/[\r\n]/.test(text) || text.trim().length === 0) {
    throw new Error("Subtask text must be a single non-empty line");
  }

  const lines = content.split("\n");
  const parentLineNo = locateLine(lines, lineNo, expectedLine);
  if (parentLineNo === null) {
    throw new Error("Parent task anchor is missing or ambiguous");
  }

  const parentCandidate = scanFocusTasks(content, palette).find((candidate) =>
    candidate.lineNo === parentLineNo && candidate.lineText === lines[parentLineNo]);
  const parent = parseTaskLine(withoutCarriageReturn(lines[parentLineNo]), palette);
  if (!parentCandidate || !parent) {
    throw new Error("Parent anchor is not a task");
  }

  const branches = scanListBranches(content, palette);
  const parentBranch = branches.get(parentLineNo);
  if (!parentBranch) {
    throw new Error("Parent anchor is not a task");
  }

  let childIndent: string | null = null;
  for (const branch of branches.values()) {
    if (branch.lineNo <= parentLineNo) continue;
    if (branch.lineNo >= parentBranch.end) break;
    childIndent = withoutCarriageReturn(lines[branch.lineNo]).match(/^[ \t]*/)?.[0] ?? "";
    break;
  }
  if (childIndent === null) {
    childIndent = `${parent.indent}${parent.indent.includes("\t") ? "\t" : "  "}`;
  }

  const newLine = `${childIndent}${parent.bullet} [ ] ${text.trim()}`;
  const usesCrLf = content.match(/\r\n|\n/)?.[0] === "\r\n";
  const hasFollowingLine = parentLineNo + 1 < lines.length;
  if (usesCrLf && !lines[parentLineNo].endsWith("\r")) {
    lines[parentLineNo] += "\r";
  }
  lines.splice(parentLineNo + 1, 0, `${newLine}${usesCrLf && hasFollowingLine ? "\r" : ""}`);
  return lines.join("\n");
}

function withoutCarriageReturn(line: string): string {
  return line.endsWith("\r") ? line.slice(0, -1) : line;
}
