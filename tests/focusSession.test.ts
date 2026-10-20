import { describe, expect, test } from "vitest";
import {
  elapsedSessionSeconds,
  migrateFocusSession,
  reconcileFocusSession,
  reanchorFocusSessionTask,
  scanFocusTasks,
  type FocusSession,
} from "../src/core/focusSession";

function session(overrides: Partial<FocusSession> = {}): FocusSession {
  return {
    filePath: "focus.md",
    tasks: [
      {
        lineNo: 1,
        lineText: "- [ ] First",
        text: "First",
        done: false,
        missing: false,
      },
      {
        lineNo: 2,
        lineText: "- [ ] Second",
        text: "Second",
        done: false,
        missing: false,
      },
    ],
    status: "active",
    startedAt: 1_000,
    activeSince: 1_000,
    elapsedMs: 0,
    finishedAt: null,
    ...overrides,
  };
}

describe("scanFocusTasks", () => {
  test("skips frontmatter and fenced examples while preserving source line numbers", () => {
    const content = [
      "---",
      "sample: '- [ ] Metadata example'",
      "---",
      "- [ ] First",
      "```md",
      "- [ ] Code example",
      "```",
      "  * [x] Done",
    ].join("\n");

    expect(scanFocusTasks(content)).toEqual([
      {
        lineNo: 3,
        lineText: "- [ ] First",
        text: "First",
        checked: false,
        eligible: true,
      },
      {
        lineNo: 7,
        lineText: "  * [x] Done",
        text: "Done",
        checked: true,
        eligible: false,
      },
    ]);
  });

  test("normalizes status, time and checkbox and rejects duplicate titles", () => {
    const tasks = scanFocusTasks([
      "- [ ] 🔥 Same ⏱️ 0:01:00",
      "- [x] Same",
      "- [ ] Unique",
    ].join("\n"), ["🔥"]);

    expect(tasks.map(({ text, checked, eligible }) => ({ text, checked, eligible }))).toEqual([
      { text: "Same", checked: false, eligible: false },
      { text: "Same", checked: true, eligible: false },
      { text: "Unique", checked: false, eligible: true },
    ]);
  });

  test("supports tilde fences and does not enroll empty titles", () => {
    expect(scanFocusTasks("~~~\n- [ ] Hidden\n~~~\n- [ ] ")).toEqual([
      {
        lineNo: 3,
        lineText: "- [ ] ",
        text: "",
        checked: false,
        eligible: false,
      },
    ]);
  });

  test("preserves the raw carriage return in CRLF task anchors", () => {
    expect(scanFocusTasks("# Focus\r\n- [ ] First\r\n")[0]).toMatchObject({
      lineNo: 1,
      lineText: "- [ ] First\r",
      text: "First",
      eligible: true,
    });
  });

  test("skips root indented code but keeps a task nested under a list", () => {
    const tasks = scanFocusTasks([
      "    - [ ] Root code example",
      "        - [ ] Nested code example",
      "- Parent item",
      "    - [ ] Nested task",
    ].join("\n"));

    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ lineNo: 3, text: "Nested task", eligible: true });
  });
});

describe("reconcileFocusSession", () => {
  test("reanchors reordered tasks and follows status, time and checkbox changes", () => {
    const reconciled = reconcileFocusSession(session(), [
      "# Focus",
      "- [x] ✅ Second ⏱️ 0:00:12",
      "text",
      "- [ ] 🔄 First ⏱️ 0:00:05",
    ].join("\n"));

    expect(reconciled.tasks).toEqual([
      {
        lineNo: 3,
        lineText: "- [ ] 🔄 First ⏱️ 0:00:05",
        text: "First",
        done: false,
        missing: false,
      },
      {
        lineNo: 1,
        lineText: "- [x] ✅ Second ⏱️ 0:00:12",
        text: "Second",
        done: true,
        missing: false,
      },
    ]);
    expect(reconciled.status).toBe("active");
  });

  test("follows completed-task undo instead of accumulating completion", () => {
    const done = reconcileFocusSession(session(), "- [x] First\n- [ ] Second");
    const undone = reconcileFocusSession(done, "- [ ] First\n- [ ] Second");

    expect(done.tasks[0].done).toBe(true);
    expect(undone.tasks[0].done).toBe(false);
  });

  test("marks deleted and ambiguous tasks missing without awarding completion", () => {
    const deleted = reconcileFocusSession(session(), "- [ ] Second");
    expect(deleted.tasks[0]).toMatchObject({ text: "First", done: false, missing: true });

    const ambiguous = reconcileFocusSession(session(), [
      "- [x] First",
      "- [x] First",
      "- [ ] Second",
    ].join("\n"));
    expect(ambiguous.tasks[0]).toMatchObject({ text: "First", done: false, missing: true });
  });

  test("keeps a finished summary frozen", () => {
    const finished = session({ status: "finished", activeSince: null, finishedAt: 5_000 });
    expect(reconcileFocusSession(finished, "- [x] First\n- [x] Second")).toBe(finished);
  });
});

describe("focus session helpers", () => {
  test("counts only active wall time", () => {
    expect(elapsedSessionSeconds(session({ elapsedMs: 2_500 }), 4_600)).toBe(6);
    expect(elapsedSessionSeconds(session({ status: "paused", activeSince: null, elapsedMs: 2_500 }), 99_000)).toBe(2);
  });

  test("reanchors an explicit inline rename", () => {
    const renamed = reanchorFocusSessionTask(
      session(),
      "focus.md",
      1,
      "- [ ] First",
      "- [x] 🔵 Renamed ⏱️ 0:00:03",
    );

    expect(renamed.tasks[0]).toEqual({
      lineNo: 1,
      lineText: "- [x] 🔵 Renamed ⏱️ 0:00:03",
      text: "Renamed",
      done: true,
      missing: false,
    });
  });

  test("migrates missing flags but rejects structurally invalid stored sessions", () => {
    const stored = session();
    const withoutMissing = {
      ...stored,
      tasks: stored.tasks.map(({ missing: _missing, ...task }) => task),
    };
    expect(migrateFocusSession(withoutMissing)?.tasks.every((task) => !task.missing)).toBe(true);
    expect(migrateFocusSession({ ...stored, tasks: [] })).toBeNull();
    expect(migrateFocusSession({ ...stored, elapsedMs: -1 })).toBeNull();
    expect(migrateFocusSession({ ...stored, status: "unknown" })).toBeNull();
  });
});
