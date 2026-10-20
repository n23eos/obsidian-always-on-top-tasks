# Feature Specification: Persistent breaks

Created: 2026-10-20. Status: approved for implementation by user request.
Working branch: main; feature directory numbering is independent of Git.
Input: Keep the break timer after restarting Obsidian.

## User Scenarios & Testing

### US1 - Resume an active break (P1)

A user starts a break and reopens Obsidian. The same break continues, including
elapsed time while the app was closed. Independent check: restart during a break,
end it, and verify the entire duration was added once to the original note.

Acceptance: restarting does not reset the clock, note destination or controls.
Resetting display settings does not discard the break. Renaming its note/folder
updates its destination before the next restart.

### US2 - Recover an interrupted save (P1)

A user ends a break while storage fails, restarts, and retries. Independent check:
freeze at five seconds, restart later, retry and verify five seconds added once.
If the note was written but cleanup failed, retry must not add the duration again.

### Edge Cases

Missing note, invalid old settings, zero-second break, renamed folder, duplicate
coffee lines and an externally edited total while recovery is pending. Ambiguous
recovery retains the pending break and reports the problem instead of guessing.

## Requirements

- FR-001: Preserve an active break and its destination across restart.
- FR-002: Preserve the first stop time across errors/restart; retries add no time.
- FR-003: Successful recovery must not double-count previously saved time.
- FR-004: Existing user settings and task/session timers remain compatible.
- FR-005: A failed break save prevents starting a competing task timer.
- FR-006: Provide regression tests for restart, failure recovery and migration.

### Key Entities

Break: destination note, start time, optional frozen end and recovery evidence.
Note break total: the existing readable coffee-duration line.

## Success Criteria

- Active-break restart preserves duration to the existing one-second precision.
- Failed-save restart and repeated retries produce exactly one contribution.
- Invalid stored state does not crash startup or reset unrelated settings.

## Assumptions

The app may be closed during a break; wall-clock elapsed time still counts.
No visual redesign, publication, hidden note IDs or new dependencies are required.
