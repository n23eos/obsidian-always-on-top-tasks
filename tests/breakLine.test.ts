import { describe, expect, test } from "vitest";
import { addBreakTime, parseBreakLine } from "../src/core/breakLine";

describe("parseBreakLine", () => {
  test("parses a break total line", () => {
    expect(parseBreakLine("☕ 0:05:32")).toBe(332);
    expect(parseBreakLine("☕ 1:00:00")).toBe(3600);
  });

  test("accepts variation selector and legacy H:MM", () => {
    expect(parseBreakLine("☕️ 0:05:32")).toBe(332);
    expect(parseBreakLine("☕ 01:23")).toBe(83 * 60);
  });

  test("rejects non-break lines", () => {
    expect(parseBreakLine("- [ ] ☕ 0:01:00")).toBeNull(); // это задача
    expect(parseBreakLine("☕ кофе с собой")).toBeNull();
    expect(parseBreakLine("текст ☕ 0:01:00")).toBeNull();
    expect(parseBreakLine("")).toBeNull();
  });
});

describe("addBreakTime", () => {
  test("appends a break line to a note without one", () => {
    expect(addBreakTime("# Focus\n- [ ] Task\n", 300)).toBe("# Focus\n- [ ] Task\n☕ 0:05:00\n");
  });

  test("appends without trailing newline style preserved", () => {
    expect(addBreakTime("- [ ] Task", 60)).toBe("- [ ] Task\n☕ 0:01:00");
  });

  test("accumulates into an existing break line", () => {
    expect(addBreakTime("# F\n☕ 0:05:00\n- [ ] Task\n", 60)).toBe("# F\n☕ 0:06:00\n- [ ] Task\n");
  });

  test("updates only the first break line", () => {
    expect(addBreakTime("☕ 0:01:00\n☕ 0:02:00", 60)).toBe("☕ 0:02:00\n☕ 0:02:00");
  });

  test("empty note gets just the break line", () => {
    expect(addBreakTime("", 90)).toBe("☕ 0:01:30\n");
  });
});
