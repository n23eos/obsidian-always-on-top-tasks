# Design decisions, 2026-10-20

- Decision: selected task queue instead of counting all note checkboxes. Rationale:
  historical completions and unrelated tasks cannot inflate a session goal.
- Decision: one task shown by default, full note remains one click away. Rationale:
  preserve a clear next action while retaining editing and task selection.
- Decision: explicit finish, no forced countdown. Rationale: user requested a task
  quantity goal, and tasks differ in duration. Session duration is descriptive.
- Decision: use unique normalized titles for conservative reconciliation; disable
  ambiguous enrollment and explain it. Existing notes have no stable task IDs.
- Decision: preserve TimerService stop/retry ordering. Source: current service and
  90 existing regression tests; read-only explorer findings 2026-10-20.
- API check: installed obsidian types 1.13.1. Context7 official developer docs
  confirmed registerEvent(vault.on('modify')) and atomic vault.process; these APIs
  predate the existing minimum supported version.
- Alternatives rejected: full task manager, streaks, rewards, cloud analytics,
  automatic task completion on countdown, task IDs inserted into user notes.
- Review correction: merge settings patches inside the persistence queue and
  publish only successful state. Preserve a frozen pending timer when its save
  fails, without resurrecting unrelated failed session updates.
- Review correction: read Markdown inside the session queue. Reanchor through the
  timer queue with an exact expected anchor; a pending timer can recover only when
  the elapsed baseline is unchanged, preserving its original stop time.
- Compatibility correction: preserve CRLF anchors and line endings; exclude root
  indented code from task enrollment while retaining nested Markdown tasks.
- Completion rule: freeze the session clock when all selected tasks are checked,
  then let the user explicitly finish. Undo changes progress without resuming time.
