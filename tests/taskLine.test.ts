import { describe, expect, test } from "vitest";
import {
  parseTaskLine,
  withStatusEmoji,
  withElapsed,
  formatDuration,
  parseDuration,
  stripFrontmatter,
  withChecked,
  withText,
  STATUS_EMOJIS,
  parseStatusPalette,
} from "../src/core/taskLine";

describe("parseTaskLine", () => {
  test("parses a simple unchecked task", () => {
    const parsed = parseTaskLine("- [ ] Fix auth bug");
    expect(parsed).toEqual({
      indent: "",
      bullet: "-",
      checked: false,
      statusEmoji: null,
      text: "Fix auth bug",
      elapsedSeconds: null,
    });
  });

  test("parses a checked task with x and X", () => {
    expect(parseTaskLine("- [x] Done")?.checked).toBe(true);
    expect(parseTaskLine("- [X] Done")?.checked).toBe(true);
  });

  test("parses star bullet and indentation", () => {
    const parsed = parseTaskLine("    * [ ] Nested task");
    expect(parsed?.indent).toBe("    ");
    expect(parsed?.bullet).toBe("*");
  });

  test("parses tab indentation", () => {
    expect(parseTaskLine("\t- [ ] Tabbed")?.indent).toBe("\t");
  });

  test("returns null for non-task lines", () => {
    expect(parseTaskLine("Just a paragraph")).toBeNull();
    expect(parseTaskLine("-[ ] missing space")).toBeNull();
    expect(parseTaskLine("- [] empty brackets")).toBeNull();
    expect(parseTaskLine("")).toBeNull();
  });

  test("extracts status emoji right after checkbox", () => {
    const parsed = parseTaskLine("- [ ] 🔵 Fix auth bug");
    expect(parsed?.statusEmoji).toBe("🔵");
    expect(parsed?.text).toBe("Fix auth bug");
  });

  test("emoji in the middle of text is not a status", () => {
    const parsed = parseTaskLine("- [ ] Call mom 🔵 tomorrow");
    expect(parsed?.statusEmoji).toBeNull();
    expect(parsed?.text).toBe("Call mom 🔵 tomorrow");
  });

  test("extracts elapsed time with variation selector", () => {
    const parsed = parseTaskLine("- [ ] Task ⏱️ 0:01:23");
    expect(parsed?.elapsedSeconds).toBe(83);
    expect(parsed?.text).toBe("Task");
  });

  test("extracts elapsed time without variation selector", () => {
    expect(parseTaskLine("- [ ] Task ⏱ 1:00:00")?.elapsedSeconds).toBe(3600);
  });

  test("accepts legacy HH:MM format", () => {
    expect(parseTaskLine("- [ ] Task ⏱️ 01:23")?.elapsedSeconds).toBe(83 * 60);
  });

  test("parses emoji and time together", () => {
    const parsed = parseTaskLine("- [x] ✅ Reply in Slack ⏱️ 0:00:14");
    expect(parsed?.checked).toBe(true);
    expect(parsed?.statusEmoji).toBe("✅");
    expect(parsed?.text).toBe("Reply in Slack");
    expect(parsed?.elapsedSeconds).toBe(14);
  });

  test("timer emoji not at tail stays in text", () => {
    const parsed = parseTaskLine("- [ ] Fix ⏱️ display bug");
    expect(parsed?.elapsedSeconds).toBeNull();
    expect(parsed?.text).toBe("Fix ⏱️ display bug");
  });
});

describe("withStatusEmoji", () => {
  test("adds emoji to a task without one", () => {
    expect(withStatusEmoji("- [ ] Fix auth bug", "🔵")).toBe("- [ ] 🔵 Fix auth bug");
  });

  test("replaces existing emoji", () => {
    expect(withStatusEmoji("- [ ] 🔵 Fix auth bug", "✅")).toBe("- [ ] ✅ Fix auth bug");
  });

  test("removes emoji when null", () => {
    expect(withStatusEmoji("- [ ] 🔵 Fix auth bug", null)).toBe("- [ ] Fix auth bug");
  });

  test("preserves indent, bullet, checkbox and elapsed tail", () => {
    expect(withStatusEmoji("  * [x] Old task ⏱️ 0:01:23", "⛔")).toBe(
      "  * [x] ⛔ Old task ⏱️ 0:01:23",
    );
  });

  test("returns non-task lines unchanged", () => {
    expect(withStatusEmoji("plain text", "🔵")).toBe("plain text");
  });
});

describe("withElapsed", () => {
  test("adds time to a task without one", () => {
    expect(withElapsed("- [ ] Task", 83)).toBe("- [ ] Task ⏱️ 0:01:23");
  });

  test("replaces existing time", () => {
    expect(withElapsed("- [ ] Task ⏱️ 0:01:23", 3600)).toBe("- [ ] Task ⏱️ 1:00:00");
  });

  test("normalizes legacy HH:MM on rewrite", () => {
    expect(withElapsed("- [ ] Task ⏱️ 01:23", 30)).toBe("- [ ] Task ⏱️ 0:00:30");
  });

  test("preserves emoji and structure", () => {
    expect(withElapsed("  - [x] ✅ Task ⏱️ 0:00:10", 14)).toBe("  - [x] ✅ Task ⏱️ 0:00:14");
  });

  test("returns non-task lines unchanged", () => {
    expect(withElapsed("plain text", 60)).toBe("plain text");
  });
});

describe("formatDuration / parseDuration", () => {
  test("formats seconds as H:MM:SS", () => {
    expect(formatDuration(0)).toBe("0:00:00");
    expect(formatDuration(14)).toBe("0:00:14");
    expect(formatDuration(83)).toBe("0:01:23");
    expect(formatDuration(3600)).toBe("1:00:00");
    expect(formatDuration(36000 + 754)).toBe("10:12:34");
  });

  test("roundtrips", () => {
    for (const s of [0, 1, 59, 60, 3599, 3600, 86400]) {
      expect(parseDuration(formatDuration(s))).toBe(s);
    }
  });

  test("parseDuration handles legacy HH:MM as hours:minutes", () => {
    expect(parseDuration("01:23")).toBe(83 * 60);
  });

  test("parseDuration rejects garbage", () => {
    expect(parseDuration("abc")).toBeNull();
    expect(parseDuration("1:2:3:4")).toBeNull();
    expect(parseDuration("")).toBeNull();
  });
});

describe("stripFrontmatter", () => {
  test("removes YAML frontmatter", () => {
    expect(stripFrontmatter("---\ntitle: x\n---\nBody")).toBe("Body");
  });

  test("keeps content without frontmatter", () => {
    expect(stripFrontmatter("Body\n---\nnot frontmatter")).toBe("Body\n---\nnot frontmatter");
  });

  test("handles frontmatter with trailing newline variants", () => {
    expect(stripFrontmatter("---\na: 1\n---\n\nBody")).toBe("\nBody");
  });
});

describe("STATUS_EMOJIS", () => {
  test("contains the documented palette", () => {
    for (const e of ["⬜", "🔄", "⏸️", "🔜", "⛔", "✅", "❗", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣"]) {
      expect(STATUS_EMOJIS).toContain(e);
    }
  });
});

describe("withChecked", () => {
  test("checks an unchecked task", () => {
    expect(withChecked("- [ ] Task", true)).toBe("- [x] Task");
  });

  test("unchecks a checked task, emoji and time preserved", () => {
    expect(withChecked("- [x] ✅ Task ⏱️ 0:00:14", false)).toBe("- [ ] ✅ Task ⏱️ 0:00:14");
  });

  test("returns non-task lines unchanged", () => {
    expect(withChecked("plain", true)).toBe("plain");
  });
});

describe("withText", () => {
  test("replaces text, preserves emoji and time", () => {
    expect(withText("- [ ] 🔵 Old text ⏱️ 0:01:23", "New text")).toBe(
      "- [ ] 🔵 New text ⏱️ 0:01:23",
    );
  });

  test("replaces text on a plain task", () => {
    expect(withText("  * [x] Old", "New")).toBe("  * [x] New");
  });

  test("returns non-task lines unchanged", () => {
    expect(withText("plain", "New")).toBe("plain");
  });
});

describe("custom status palette", () => {
  const palette = ["🔥", "🧊"];

  test("parseTaskLine recognises an emoji from a custom palette", () => {
    const parsed = parseTaskLine("- [ ] 🔥 Hot task ⏱️ 0:01:00", palette);
    expect(parsed?.statusEmoji).toBe("🔥");
    expect(parsed?.text).toBe("Hot task");
    expect(parsed?.elapsedSeconds).toBe(60);
  });

  test("a default emoji missing from the custom palette stays part of the text", () => {
    const parsed = parseTaskLine("- [ ] 🔵 Blue task", palette);
    expect(parsed?.statusEmoji).toBeNull();
    expect(parsed?.text).toBe("🔵 Blue task");
  });

  test("withStatusEmoji replaces a custom emoji with another one", () => {
    expect(withStatusEmoji("- [ ] 🔥 Task", "🧊", palette)).toBe("- [ ] 🧊 Task");
  });

  test("parseStatusPalette falls back to the default list when empty", () => {
    expect(parseStatusPalette("")).toEqual(STATUS_EMOJIS);
    expect(parseStatusPalette("   \n ")).toEqual(STATUS_EMOJIS);
  });

  test("parseStatusPalette splits on whitespace and drops duplicates", () => {
    expect(parseStatusPalette("🔥  🧊\n🔥")).toEqual(["🔥", "🧊"]);
  });
});
