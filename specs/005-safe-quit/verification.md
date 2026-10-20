# Verification: safe first-request quit

Date: 2026-10-20. Host: macOS, Obsidian 1.13.7, Electron 39.8.3.

## Design and safety boundary

A fixed esbuild-generated factory runs in the Electron main process through the
already available remote bridge. Whole Electron/timers module objects preserve
native identity; no renderer callbacks, user text or file contents are evaluated.
The normal three-file plugin installation is unchanged.

The guard participates only for the exact tested platform/versions, when the
current vault and one focus overlay are the only native windows, and when its
before-quit observer is last so earlier observers have already had their veto.
A nonce-scoped preflight drains both service queues, checkpoints durable settings
and rechecks queue stability. A failed save cancels the attempt before windows
close. Native host save/unload hooks remain intact. The acknowledged quit may
finish with one native app.quit retry after zero windows remain; no app.exit,
destroy, force kill, leaf detach during unload or host handler replacement is used.

Foreign windows, activation, native veto, main-frame navigation, crash and the
bounded deadline cancel participation. Iframe/same-document navigation does not
remove the guard. Ordinary reload cleans up. A guard already completing an
acknowledged quit survives renderer disposal only until completion/deadline.

## Automated verification

187 tests across 12 files pass, along with TypeScript, ESLint, production build
and diff check. New coverage includes preflight ordering and failure, queue
cascades, work arriving during checkpoint, stale nonce, foreign windows, native
veto, repeated Quit, deadline cleanup, reload/crash/navigation, remote failure,
late native window availability and execution outside the renderer context.
Regression failures were observed before their corresponding corrections.

Independent safety review found an installation-failure cleanup leak. The guard
is now installed at the end of onload, and partial installation cleans up both
bridge and native guard. Final review found no remaining P1/P2.

## Actual Obsidian checks

All actions used Obsidian's CLI/services and native application Quit. Temporary
work was confined to a disposable note. Other open vaults were closed normally
for the isolated test, recorded locally, and reopened afterward.

- Injected a settings checkpoint failure. One Quit left the same process, both
  windows, selected session and task timer intact, and showed the save-error
  notice. The original save function was restored before continuing.
- Active session: a single external Quit request terminated PID 40098 in 0.76 s.
  Relaunch created PID 40181. The selected session, running timer and break state
  matched exactly; one open always-on-top overlay was restored.
- Paused session with a break: a single external Quit terminated PID 40181 in
  0.76 s. Relaunch created PID 40288. The frozen session duration, absent task
  timer and original break start timestamp matched exactly. One pinned overlay
  was restored.
- Two plugin reloads retained exactly one guard in addition to the host's
  before-quit handler. Session/break state was unchanged.
- Closing only the overlay kept the Obsidian process running and preserved the
  paused session and break.
- Finished/cleared the synthetic session, trashed the test note and reopened
  the other vaults and settings. No synthetic timer remains.

An initial test encountered a reopened foreign vault and correctly fell back to
host behavior; it is not counted as a successful guard test. A fast relaunch once
received macOS Launch Services error -600 after confirmed process exit; bounded
launch retry resolved it. No extra Quit or force kill was used in the successful
final restart cycles.

Evidence is local/ignored under docs/screenshots/.tmp/: safe-quit-active-result,
safe-quit-paused-result, safe-quit-failure-result and safe-quit-cleanup-result JSON.

## Installation and limits

The tested local build is installed over 0.8.1 in Raincoat. Existing data.json was
preserved during installation; the backup path is recorded in the private project
card. At the time of the native checks, no publication had been requested. On 2026-10-21, the owner requested commit, push and release 0.8.2 with the single-vault limitation explicitly documented.

This is intentionally not a general multi-vault shutdown fix. Other native
windows, unsupported host versions or later Quit observers disable the workaround.
Those configurations may still require a second normal Quit. Native mouse clicks
were not automated. Exact state preservation and full process exit/relaunch were
verified through the actual running application.
