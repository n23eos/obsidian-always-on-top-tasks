# Safe first-request quit

User request: quit Obsidian with an open focus overlay on the first request,
without losing sessions or timers; verify a full restart.

## Required behavior

- Gate the workaround to the observed macOS / Obsidian 1.13.7 / Electron 39.8.3
  combination. Unsupported hosts retain normal behavior.
- Only participate while the current vault window and its single focus popout
  are the complete set of BrowserWindows. Foreign windows disable participation.
- Save pending session/timer work and a durable settings snapshot before
  allowing windows to close. A failed snapshot leaves windows open.
- Preserve running timestamps and paused durations. Never stop a task or break
  just to quit; do not modify note content from the shutdown hook.
- Use normal app.quit only. Never destroy windows, call app.exit, clear host
  beforeunload handlers or detach leaves during plugin unload.
- A main-process guard may complete the original requested quit once all
  scoped windows are gone. Bound its lifetime and cancel on activation/new
  windows, native veto, disabled plugin or failed preparation.
- Ordinary window close and plugin reload must never quit the application.

## Verification

Regression tests for durability ordering, failures, foreign windows, cancellation,
cleanup and one-shot completion. Real Obsidian: a single normal Quit, absence of
old PID, new PID, exact active/paused session and task/break state, one restored
pinned overlay. Verify failed saving does not close the windows.
