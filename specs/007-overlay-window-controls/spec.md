# Feature Specification: Overlay window controls

**Created**: 2026-10-21
**Status**: Accepted for implementation
**Input**: Fix GitHub issues 1, 2 and 3; verify in Obsidian; prepare a release.

## User Scenarios & Testing

### User Story 1 - Predictable drag area (P1)
The visible top area works as a window handle, including its side padding.
Acceptance: dragging any noninteractive part of the top area moves the window;
buttons still work, including the running-task stop button.

### User Story 2 - Compact height (P1)
Users with few tasks choose a shorter docked overlay.
Acceptance: a saved height applies on either edge and survives reopening;
full height remains the default; free mode retains manually chosen size.

### User Story 3 - Hide private tasks (P1)
Users hide overlay content with one button or an Obsidian command and reveal it
explicitly when ready. Tasks, title, session and timer text disappear immediately.
Acceptance: settings changes, note edits and pending renders cannot reveal hidden
content. Timers keep running. Hidden state survives workspace restoration.

### Edge Cases
Small displays, invalid saved dimensions, pending asynchronous render, an open
editor or picker, deleted note, plugin reload and keyboard access.

## Requirements
- FR-001: The whole visible top block, except controls, is a drag handle.
- FR-002: Docked height is configurable with a full-height default and screen bounds.
- FR-003: Free-mode sizing remains available.
- FR-004: Hide and reveal work in one action without changing task or timer data.
- FR-005: The hidden placeholder discloses no note or task names.
- FR-006: Hidden state is retained when the workspace is restored.

### Key Entities
Overlay geometry preferences and per-view visibility state.

## Success Criteria
All three acceptance scenarios pass. Existing checks remain green. Native Obsidian
checks and any unavailable physical platform checks are recorded separately.

## Assumptions
Issue 3 explicitly permits hiding content as an alternative to Win+D. This release
uses that option with an Obsidian hotkey command. It does not register a global
shortcut or claim Windows Show Desktop support. Release preparation includes a
version bump, English notes and local build; publication is a separate action.
