# Verification: 0.10.0 window controls

Date: 2026-10-21. Prepared locally and installed in Raincoat. Not published.

## Automated

216 tests passed. TypeScript check, ESLint, production build and git diff --check
passed. Independent review found a note-HTML placeholder collision and a free-size
capture gap; both were fixed and reviewed again without remaining findings.
Privacy tests cover immediate hide, pending reads, open transient controls, saved
state, reveal, document title and a note containing the placeholder CSS class.
Geometry tests cover full/custom/clamped height and free bounds. Settings tests
cover validation, migration, default full height and conditional controls.

## Actual Obsidian

33 programmatic checks passed on macOS, Obsidian 1.13.7, using the installed build
and actual SettingsTab, view, command registry, timer service and Electron window.
Results: native-results.json. Tested:

- Left/right geometry, 200 px minimum, custom height, full height, screen clamping.
- Custom height preserved by full-height toggle and plugin reload.
- Free sizing and rapid free/docked/free switching before periodic saving.
- Hidden state after plugin reload, exact title removal, settings refresh, command
  reveal, open-editor hide and running timer preservation/stop after reveal.
- Actual Markdown HTML cannot spoof the privacy placeholder.
- Top block starts at y=0, covers both side edges, is a drag region, and buttons
  remain excluded from that region. Computed native styles and bounds verified.

Native testing found and fixed Obsidian's higher-specificity content padding,
stale popout document titles and geometry adoption before stored settings loaded.
Original user settings restored with zero mismatches, test note moved to Trash,
overlay closed. Installed main.js/manifest.json/styles.css match release bundle.

## Browser UI

Production view fixture checked with CUA: hide button, Enter to reveal, reload
while hidden, 240/340 px widths, light/dark themes. Final screenshot:
preview/privacy.png. Fixture initially lacked workspace.requestSaveLayout;
updated the host adapter and persisted view state. No further browser errors
occurred after the fix; the earlier console error remains in tab history.

## Limits

Native app input is unavailable in CUA (apps inventory empty). Physical mouse
dragging and native visual appearance were not verified. Browser screenshots do
not prove native dragging. Windows Win+D was not implemented or tested: issue 3
is addressed by its explicitly requested content-hiding alternative. The Obsidian
command is not a system-wide shortcut. Main-window notes/status bar stay visible.
No complete process restart was run in this change; actual plugin reload and
workspace state restoration were tested. No commit, push, tag or publication.

## Release preparation

Version 0.10.0 synchronized in manifest, package, lockfile and versions.json.
English description: docs/releases/0.10.0.md. Local three-file bundle:
dist/always-on-top-tasks-0.10.0.zip. No external issue comments or closures made.

## Repeat QA and Raincoat installation, 2026-10-21

Rebuilt and recopied the three assets to Raincoat with a fresh backup, keeping
settings untouched during installation. Plugin reload confirmed 0.10.0.
216 tests, TypeScript check, ESLint, build and diff check passed again.

Actual Obsidian repeat test: 120 task rows, twenty hide/reveal cycles, stable DOM
size/task count, fold/expand, 1000 hidden timer ticks, correct timer stop/write,
and Focus Sessions enable/disable. All 32 assertions passed, no uncaught window
errors. These checks are in recheck-results.json.

Measured API-to-render times for 120 tasks: median 16 ms, maximum 23.8 ms.
Synchronous hide: median 1.3 ms, maximum 1.5 ms. This is a bounded local scenario,
not a claim about all vaults, OS input latency or long-term memory usage.

Original settings restored exactly, temporary note moved to Trash, overlay
closed. Native physical dragging, OS focus/other-app switching, full-process
restart and monitor changes remain manual checks. No new code fixes were needed.

## Release 0.10.0 published, 2026-10-21

Published on the owner's explicit request. Release commit 1cb31753f465d7fe5d15afd68e364744202cfe09
and tag 0.10.0 pushed. GitHub Actions 39640235853 succeeded, including tests,
typecheck, lint, build and provenance attestation. All 221 local tests passed.
English release body matches docs/releases/0.10.0.md. Downloaded main.js,
manifest.json and styles.css byte-match the local build and Raincoat installation.
Release: https://github.com/n23eos/obsidian-always-on-top-tasks/releases/tag/0.10.0
The native input and platform limitations recorded above remain unchanged.
