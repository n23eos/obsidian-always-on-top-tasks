# Verification: Focus sessions

Date: 2026-10-20. Source: implementation and checks in the current Codex task.

## Delivered

- Select the next 1, 3 or 5 open tasks, a custom goal from 1 to 20, or individual
  tasks in the current note.
- Show one current task, progress against the selected goal and an optional next
  queue. The full note remains accessible.
- Persist pause/resume, selected tasks, elapsed session time and the last summary.
  Pauses do not increase session time. All selected tasks completed freezes time;
  finishing remains explicit.
- Reconcile external checkbox changes, undo, moved lines, renamed paths and
  missing or ambiguous tasks conservatively. Previously completed tasks do not
  count toward a new session.
- Preserve stopped timer recovery on write failures and serialize settings
  updates. Concurrent checkbox/stop recovery writes elapsed time exactly once.
- Keep the existing Markdown format and dependencies.

## Automated checks

All run after the final logic correction:

| Command | Result |
| --- | --- |
| `npm test` | PASS, 127 tests across 8 files |
| `npm run check` | PASS |
| `npm run lint` | PASS |
| `npm run build` | PASS |
| `git diff --check` | PASS |

Regression coverage includes migration/reset preservation, fenced/indented code,
CRLF, duplicate titles, session pause/reload/finish, failed writes, queued patch
ordering, task/path reconciliation, and concurrent timer stop with checkbox edits.
The race test requires exactly `0:00:05`, rejects `0:00:10`, and requires a cleared
running timer. Changing the elapsed baseline prevents unsafe pending recovery.

Independent reviewer: no remaining blocking P1/P2 findings in core, service or
settings. Reviewer separately ran 72 targeted tests, TypeScript and lint.

## Browser checks

Used the production overlay, focus service, timer and persistence through
`node scripts/ui-preview.mjs` with synthetic Markdown and reloadable local storage.
No real user tasks were changed.

- Start a three-task goal and complete the first task: progress becomes 1/3 and
  the next selected task becomes current.
- Pause, reload the fixture, then resume via keyboard: the paused clock survives.
- Fail a write during early finish: retain pending time and retry controls;
  retry saves the frozen duration before showing the summary.
- Complete, undo and recheck a one-task goal: 1/1, 0/1, 1/1 without double count.
- Start another session: already completed tasks are excluded.
- Select individual tasks and start a custom two-task goal.
- Toggle the full list/current task and inspect the collapsed next queue.
- Inspect light/dark themes at widths 240, 280 and 340. The current task appears
  before session controls on narrow panels; remaining controls are reachable.

Screenshot: `docs/screenshots/.tmp/focus-session.png` (local ignored evidence).

## Local installation

Copied `main.js`, `manifest.json` and `styles.css` to the existing Raincoat plugin
installation, preserving `data.json` and regular files. All three asset hashes
match the built repository files.

- Backup: local backup recorded in the private project status card.
- `obsidian vault=Raincoat plugin:reload id=tasks-for-focus-adhd`: success.
- Runtime inspection: plugin and focus service loaded; default goal 3;
  focus-only mode enabled; pause/resume command registered; no session or task
  timer was started in the real vault.
- `data.json` SHA-256 unchanged:
  `917e3cf9cb16ad4e082a343c9a76d3bf66f70c3537bc2f508797484b07a3ee0b`.

## Limits

- Native Electron popout and always-on-top behavior were not visually inspected.
  Browser checks do not establish native window behavior.
- The break stopwatch remains memory-only; the paused focus session persists.
- Duplicate normalized titles cannot be selected. External task renaming can
  require restoring the title or finishing early to avoid guessing identity.
- No commit, push, release or public publication was performed.
