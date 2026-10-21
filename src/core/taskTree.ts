import { parseTaskLine } from "./taskLine";

export interface ListBranch {
  lineNo: number;
  end: number;
  indent: number;
  title: string;
  key: string;
  hasChildren: boolean;
}

/** List boundaries include indented notes; blank lines do not end a branch. */
export function scanListBranches(content: string, palette?: readonly string[]): Map<number, ListBranch> {
  const lines = content.split("\n");
  const result = new Map<number, ListBranch>();
  const stack: ListBranch[] = [];
  const occurrences = new Map<string, number>();
  let frontmatter = /^\uFEFF?---\s*$/.test(lines[0] ?? "");
  let fence: { marker: string; length: number } | null = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].replace(/\r$/, "");
    if (frontmatter) {
      if (i > 0 && /^(---|\.\.\.)\s*$/.test(line)) frontmatter = false;
      continue;
    }
    const indent = (line.match(/^[ \t]*/)?.[0] ?? "").replace(/\t/g, "    ").length;
    if (fence) {
      const close = line.trim().match(/^(`{3,}|~{3,})\s*$/);
      if (close && close[1][0] === fence.marker && close[1].length >= fence.length) fence = null;
      continue;
    }
    if (!line.trim()) continue;
    while (stack.length && stack[stack.length - 1].indent >= indent) {
      stack.pop()!.end = i;
    }
    const open = line.trimStart().match(/^(`{3,}|~{3,})/);
    if (open) {
      fence = { marker: open[1][0], length: open[1].length };
      continue;
    }
    const match = line.match(/^[ \t]*(?:[-*+]|\d+[.)])[ \t]+(.*)$/);
    if (!match || (indent >= 4 && !stack.length)) continue;
    const parent = stack[stack.length - 1];
    if (parent) parent.hasChildren = true;
    const title = parseTaskLine(line, palette)?.text ?? match[1];
    const identity = `${parent?.key ?? ""}/${encodeURIComponent(title)}`;
    const occurrence = occurrences.get(identity) ?? 0;
    occurrences.set(identity, occurrence + 1);
    const branch: ListBranch = {
      lineNo: i, end: lines.length, indent, title,
      key: `${identity}:${occurrence}`, hasChildren: false,
    };
    result.set(i, branch);
    stack.push(branch);
  }
  return result;
}

export function foldedLines(branches: Map<number, ListBranch>, collapsed: ReadonlySet<string>, hiddenParents: ReadonlySet<number> = new Set()): Set<number> {
  const hidden = new Set<number>();
  for (const branch of branches.values()) {
    if (!branch.hasChildren || !collapsed.has(branch.key) || hiddenParents.has(branch.lineNo)) continue;
    for (let line = branch.lineNo + 1; line < branch.end; line++) hidden.add(line);
  }
  return hidden;
}
