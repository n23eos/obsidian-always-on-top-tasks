import { describe, expect, it } from "vitest";
import { foldedLines, scanListBranches } from "../src/core/taskTree";

describe("nested list folding", () => {
  it("folds plain parents, nested tasks and notes until a sibling", () => {
     const tree = scanListBranches("- Lectures\n  - [ ] One\n    - [x] Two\n\n    notes\n- [ ] Next");
     expect(tree.get(0)?.hasChildren).toBe(true);
     expect(tree.get(1)?.hasChildren).toBe(true);
     expect([...foldedLines(tree, new Set([tree.get(0)!.key]))]).toEqual([1, 2, 3, 4]);
     expect([...foldedLines(tree, new Set([tree.get(1)!.key]))]).toEqual([2, 3, 4]);
  });
  it("keeps folds stable across timer and checkbox edits and line insertions", () => {
     const before = scanListBranches("- [ ] Parent\n  - [ ] Child");
     const after = scanListBranches("# Heading\n- [x] ✅ Parent ⏱️ 0:00:12\n  - [ ] Child");
     expect(before.get(0)?.key).toBe(after.get(1)?.key);
  });
  it("distinguishes duplicate titles and separate ancestor paths", () => {
     const tree = scanListBranches("- [ ] Same\n  - [ ] Child\n- [ ] Same\n  - [ ] Child");
     expect(new Set([...tree.values()].map((node) => node.key)).size).toBe(4);
  });
  it("ignores frontmatter, fenced code and standalone indented code", () => {
     const tree = scanListBranches("---\n- fake\n---\n```md\n- fake\n```\n    - fake\n- real\n  - child");
     expect([...tree.keys()]).toEqual([7, 8]);
  });
  it("handles tabs, ordered lists, CRLF and closing paragraphs", () => {
     const tree = scanListBranches("1. Parent\r\n\t- [ ] Child\r\nParagraph\r\n- Other");
     expect(tree.get(0)?.end).toBe(2);
     expect(tree.get(1)?.indent).toBe(4);
  });
  it("does not hide children behind a filtered-out completed parent", () => {
     const tree = scanListBranches("- [x] Parent\n  - [ ] Child");
     expect(foldedLines(tree, new Set([tree.get(0)!.key]), new Set([0])).size).toBe(0);
  });

  it("keeps custom status changes out of fold identity", () => {
    const first = scanListBranches("- [ ] 🧪 Parent\n  - [ ] Child", ["🧪", "🚀"]);
    const next = scanListBranches("- [ ] 🚀 Parent\n  - [ ] Child", ["🧪", "🚀"]);
    expect(first.get(0)?.key).toBe(next.get(0)?.key);
  });
  it("keeps deeply nested identity size linear", () => {
    const tree = scanListBranches(Array.from({ length: 30 }, (_, i) => `${"  ".repeat(i)}- [ ] Task`).join("\n"));
    expect(tree.get(29)!.key.length).toBeLessThan(500);
  });

});
