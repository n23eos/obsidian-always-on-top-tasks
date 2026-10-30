import { describe, expect, test } from "vitest";
import { insertSubtask } from "../src/core/insertSubtask";

describe("insertSubtask", () => {
  test("inserts a trimmed child first and preserves the parent bullet", () => {
    expect(insertSubtask("* [ ] Parent", 0, "* [ ] Parent", "  Child  ")).toBe(
      "* [ ] Parent\n  * [ ] Child",
    );
  });

  test("keeps a final newline when the source has one", () => {
    expect(insertSubtask("- [ ] Parent\n", 0, "- [ ] Parent", "Child")).toBe(
      "- [ ] Parent\n  - [ ] Child\n",
    );
  });

  test("follows a uniquely moved exact anchor", () => {
    const content = "# Added later\n- [ ] Parent\n- [ ] Sibling";

    expect(insertSubtask(content, 0, "- [ ] Parent", "Child")).toBe(
      "# Added later\n- [ ] Parent\n  - [ ] Child\n- [ ] Sibling",
    );
  });

  test("rejects a changed or missing anchor", () => {
    expect(() => insertSubtask("- [ ] Renamed", 0, "- [ ] Parent", "Child")).toThrow(
      "missing or ambiguous",
    );
  });

  test("rejects an ambiguous moved anchor", () => {
    const content = "# Shifted\n- [ ] Parent\n- [ ] Parent";

    expect(() => insertSubtask(content, 0, "- [ ] Parent", "Child")).toThrow(
      "missing or ambiguous",
    );
  });

  test("requires the anchor to be a scanned task outside code fences", () => {
    const fenced = "```md\n- [ ] Example\n```";

    expect(() => insertSubtask(fenced, 1, "- [ ] Example", "Child")).toThrow(
      "not a task",
    );
    expect(() => insertSubtask("- Plain item", 0, "- Plain item", "Child")).toThrow(
      "not a task",
    );
  });

  test("reuses the raw indent of the first direct child", () => {
    const content = [
      "- [ ] Parent",
      " \t* Existing child",
      " \t  - Grandchild",
      "- Sibling",
    ].join("\n");

    expect(insertSubtask(content, 0, "- [ ] Parent", "New child")).toBe([
      "- [ ] Parent",
      " \t- [ ] New child",
      " \t* Existing child",
      " \t  - Grandchild",
      "- Sibling",
    ].join("\n"));
  });

  test("adds a tab below a tab-indented parent without children", () => {
    const content = "- Outer\n\t- [ ] Parent";

    expect(insertSubtask(content, 1, "\t- [ ] Parent", "Child")).toBe(
      "- Outer\n\t- [ ] Parent\n\t\t- [ ] Child",
    );
  });

  test("adds two spaces below a space-indented parent without children", () => {
    const content = "- Outer\n   - [ ] Parent\n- Sibling";

    expect(insertSubtask(content, 1, "   - [ ] Parent", "Child")).toBe(
      "- Outer\n   - [ ] Parent\n     - [ ] Child\n- Sibling",
    );
  });

  test("preserves CRLF and the lack of a final newline", () => {
    const content = "# Focus\r\n- [ ] Parent";

    expect(insertSubtask(content, 1, "- [ ] Parent", "Child")).toBe(
      "# Focus\r\n- [ ] Parent\r\n  - [ ] Child",
    );
  });

  test("preserves a final CRLF", () => {
    const content = "- [ ] Parent\r\n";

    expect(insertSubtask(content, 0, "- [ ] Parent\r", "Child")).toBe(
      "- [ ] Parent\r\n  - [ ] Child\r\n",
    );
  });

  test.each(["", "   ", "first\nsecond", "first\r\nsecond"])(
    "rejects empty or multiline text %j",
    (text) => {
      expect(() => insertSubtask("- [ ] Parent", 0, "- [ ] Parent", text)).toThrow(
        "single non-empty line",
      );
    },
  );
});
