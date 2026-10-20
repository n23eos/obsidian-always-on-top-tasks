# Verification: Persistent breaks

Date: 2026-10-20. Source: current implementation, local checks and browser fixture.

## Implemented

The break start, destination, optional frozen stop and before/after total journal
persist in settings. Getters restore them directly after loading settings. Reset
preserves the break, rename updates its path, and a failed break save blocks a new
task timer. Time while the app is closed counts toward an active break.

Before every note mutation the journal is saved again, including retries after a
failed settings write. Current total matching the expected post-state is treated
as already committed; duplicate or changed totals remain pending. No note IDs or
full-note snapshots are stored. A failed fresh start is not published in memory.
The footer exposes Retry break save and remains visible for a pending break even
when the user disables future breaks.

## Checks

- npm test: PASS, 141 tests in 8 files.
- npm run check: PASS.
- npm run lint: PASS.
- npm run build: PASS.
- git diff --check: PASS.
- Independent read-only review: no P1/P2 findings remaining; 69 targeted tests,
  TypeScript and lint separately passed.

Regressions cover active/frozen state reconstruction, reset/migration, rename,
failed initial persistence, failed stop/journal persistence, note-write failure,
cleanup failure with restart, exactly-once recovery and ambiguous totals.

## Browser evidence

Production UI/service fixture, synthetic data only:

1. Pause a focus session to start a break, reload, then stop: the continued
   duration was saved as coffee total 0:00:19.
2. Start another break and simulate a write failure at 0:00:18. Reload preserved
   the frozen 18 seconds and displayed Retry break save. Waiting did not increase
   it. Retry produced total 0:00:37, exactly 19 + 18 seconds.
3. Reload after successful save: Start break shown, no restored pending timer.
4. Inspect pending retry at widths 340 and 240: action is readable and reachable.

Screenshot: docs/screenshots/.tmp/break-restored.png (local ignored evidence).

## Installation

Backed up existing assets and data.json to:
Local backup recorded in the private project status card.

Copied main.js, styles.css and manifest.json into the existing Raincoat install.
All three assets match the build. No active task/break existed before reload.
CLI plugin:reload succeeded; runtime reports persisted break defaults, the
settings-backed break getter and the focus session service. data.json unchanged.

## Limits

Initial implementation was checked through service reconstruction, a browser
reload and native plugin reload. Full application restart was then verified below.
Native popout visual behavior was not rechecked. Storage must accept the initial
state write for a break to survive a crash.

## Full application restart verification for 0.8.0

User explicitly requested full restart, commit, push and release on 2026-10-20.
Obsidian 1.13.7, Electron 39.8.3, macOS. Used a dedicated synthetic note and the
installed production plugin. No active user task or break existed at test start.

- Graceful app.quit closed the complete application. The main process disappeared
  before relaunch, and its PID changed from 5243 to 71717.
- The active break restored the exact persisted start and note path. Ending it
  recorded 7 seconds, within the measured start/stop interval.
- A second break was stopped after a simulated write failure scoped exclusively
  to the test note. Both its start and frozen stop were confirmed on disk.
- A second full quit/relaunch changed the main PID from 71717 to 71937 and restored
  the same frozen state. Two end/retry calls recorded its 1 second only once:
  the final coffee total was exactly 8 seconds.
- The synthetic note was moved to the vault trash and no test timer remained.
- After bumping to 0.8.0, all 141 tests, check, lint, build and diff checks passed.
- Release readiness review found a lockfile version mismatch; the bump script now
  updates both lockfile version fields. No P1/P2 findings remained after correction.

Raw local evidence is in ignored docs/screenshots/.tmp/full-restart-result.json.
Release description: [0.8.0](../../docs/releases/0.8.0.md).
