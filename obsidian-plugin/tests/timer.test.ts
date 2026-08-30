import { describe, expect, test } from "vitest";
import {
  commitSession,
  locateTimerLine,
  LONG_SESSION_THRESHOLD_SECONDS,
  type RunningTimer,
} from "../src/core/timer";

const NOTE = ["# Focus", "", "- [ ] Fix auth bug", "- [ ] Call mom", "- [x] ✅ Ship it ⏱️ 0:10:00"];

function timerAt(lineNo: number, lineText: string, startedAt: number): RunningTimer {
  return { filePath: "focus.md", lineNo, lineText, startedAt };
}

describe("locateTimerLine", () => {
  test("finds line at stored position when text matches", () => {
    expect(locateTimerLine(NOTE, timerAt(2, "- [ ] Fix auth bug", 0))).toBe(2);
  });

  test("finds moved line by exact text", () => {
    const shifted = ["# Focus", "", "- [ ] New task on top", "- [ ] Fix auth bug"];
    expect(locateTimerLine(shifted, timerAt(3, "- [ ] New task on top", 0))).toBe(2);
  });

  test("returns null when line was renamed", () => {
    expect(locateTimerLine(NOTE, timerAt(2, "- [ ] Fix auth bug RENAMED", 0))).toBeNull();
  });

  test("returns null for duplicate candidates", () => {
    const dup = ["- [ ] Call mom", "- [ ] Call mom"];
    expect(locateTimerLine(dup, timerAt(5, "- [ ] Call mom", 0))).toBeNull();
  });

  test("stored position wins over duplicates elsewhere", () => {
    const dup = ["- [ ] Call mom", "- [ ] other", "- [ ] Call mom"];
    expect(locateTimerLine(dup, timerAt(2, "- [ ] Call mom", 0))).toBe(2);
  });
});

describe("commitSession", () => {
  const START = 1_000_000_000_000;

  test("writes session time into a task without previous time", () => {
    const result = commitSession(NOTE.join("\n"), timerAt(2, "- [ ] Fix auth bug", START), START + 83_000);
    expect(result.kind).toBe("ok");
    expect(result.sessionSeconds).toBe(83);
    expect(result.content?.split("\n")[2]).toBe("- [ ] Fix auth bug ⏱️ 0:01:23");
  });

  test("accumulates with existing time", () => {
    const result = commitSession(
      NOTE.join("\n"),
      timerAt(4, "- [x] ✅ Ship it ⏱️ 0:10:00", START),
      START + 60_000,
    );
    expect(result.content?.split("\n")[4]).toBe("- [x] ✅ Ship it ⏱️ 0:11:00");
  });

  test("leaves other lines untouched", () => {
    const result = commitSession(NOTE.join("\n"), timerAt(2, "- [ ] Fix auth bug", START), START + 1000);
    const lines = result.content?.split("\n");
    expect(lines?.[0]).toBe("# Focus");
    expect(lines?.[3]).toBe("- [ ] Call mom");
    expect(lines?.length).toBe(NOTE.length);
  });

  test("reports not-found with elapsed preserved in result", () => {
    const result = commitSession(NOTE.join("\n"), timerAt(2, "- [ ] Gone task", START), START + 45_000);
    expect(result.kind).toBe("not-found");
    expect(result.content).toBeUndefined();
    expect(result.sessionSeconds).toBe(45);
  });

  test("flags long sessions over threshold", () => {
    const threeHoursMs = 3 * 3600 * 1000;
    const result = commitSession(NOTE.join("\n"), timerAt(2, "- [ ] Fix auth bug", START), START + threeHoursMs);
    expect(result.kind).toBe("ok");
    expect(result.isLongSession).toBe(true);
    expect(result.sessionSeconds).toBe(3 * 3600);
  });

  test("short session is not long", () => {
    const result = commitSession(NOTE.join("\n"), timerAt(2, "- [ ] Fix auth bug", START), START + 10_000);
    expect(result.isLongSession).toBe(false);
    expect(LONG_SESSION_THRESHOLD_SECONDS).toBe(7200);
  });

  test("zero-length session still writes 0 seconds added", () => {
    const result = commitSession(NOTE.join("\n"), timerAt(2, "- [ ] Fix auth bug", START), START);
    expect(result.kind).toBe("ok");
    expect(result.content?.split("\n")[2]).toBe("- [ ] Fix auth bug ⏱️ 0:00:00");
  });

  test("returns new line text for timer re-anchoring", () => {
    const result = commitSession(NOTE.join("\n"), timerAt(2, "- [ ] Fix auth bug", START), START + 5000);
    expect(result.newLineText).toBe("- [ ] Fix auth bug ⏱️ 0:00:05");
    expect(result.lineNo).toBe(2);
  });

  test("clock skew (now before start) clamps to zero, not negative", () => {
    const result = commitSession(NOTE.join("\n"), timerAt(2, "- [ ] Fix auth bug", START), START - 5000);
    expect(result.sessionSeconds).toBe(0);
  });
});
