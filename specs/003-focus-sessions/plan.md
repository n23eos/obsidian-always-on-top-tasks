# Implementation Plan: Focus sessions

Date: 2026-10-20. Spec: [spec.md](spec.md). Working Git branch: main.

## Summary

Add a persistent, selected-task session above the existing overlay. Preserve the
Markdown task format and TimerService recovery semantics. Separate pure task
matching from lifecycle orchestration and UI.

## Technical Context

TypeScript strict, Obsidian API types 1.13.1 with existing minAppVersion 1.4.10,
esbuild 0.24, Vitest 2, existing ESLint configuration. No new dependencies.
Storage: existing plugin data.json for session state; Markdown for task completion/time.
Target: desktop Obsidian, browser fixture for production overlay/service checks.
Bound: one note, one session, at most 20 selected tasks. No per-second disk writes.

## Constitution Check

Passed before and after design: plain Markdown, conservative ambiguous matching,
serialized mutations, keyboard-visible controls, preserved settings, !notes ignored.
Native Electron behavior will be distinguished from browser verification.

## Project Structure

- src/core/focusSession.ts: scan, validate, reconcile and calculate elapsed duration.
- src/FocusSessionService.ts: persisted lifecycle with TimerService coordination.
- src/settings.ts: migration and preserved session on reset.
- src/SettingsPersistence.ts: queued patch merge with safe failed-save behavior.
- src/overlay/FocusSessionPanel.ts: session controls and selection.
- src/overlay/FocusOverlayView.ts: integration, focus filtering and inline reanchors.
- src/main.ts: global modify/rename synchronization, session commands.
- styles.css: responsive panel and session task emphasis.
- tests/focusSession.test.ts, tests/FocusSessionService.test.ts: behavior and failures.
- scripts/ui/: production UI fixture with reloadable synthetic storage.

## Execution

Core/service implementation and UI integration have separate owners. After both
converge, run existing checks, independent logic review, browser scenarios and
record only verified results. No publication or version bump.

Completed 2026-10-20. All stories and local installation are verified as recorded
in [verification.md](verification.md). Native Electron visual behavior remains
outside the available browser fixture.
