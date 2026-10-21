# Feature Specification: Optional sessions and nested lists

Created: 2026-10-21
Status: Approved for implementation by user request

## User Scenarios & Testing

### User Story 1 - Optional focus sessions (P1)
Disable focus sessions in settings to use the ordinary task overlay.
Acceptance: session controls and filtering disappear immediately; active sessions
pause without losing progress; enabling again allows explicit resume.
Independent test: toggle with an active session and reload settings.

### User Story 2 - Fold nested tasks (P1)
Collapse a parent list item to hide descendants and expand it to show them.
Acceptance: checkbox and plain list parents support keyboard-accessible arrows;
multiple nesting levels work independently; counters still include hidden tasks;
folding never modifies the note. A running hidden task remains stoppable.
Independent test: collapse and expand a parent with five completed children.

### Edge Cases
Duplicate titles have separate fold state. Blank lines do not end nesting.
Frontmatter and fenced code are not list controls. Hidden completed parents
must not strand open children. Current-task focus mode ignores folds.

## Requirements
- FR-001: Persist the enable switch, enabled by default for existing users.
- FR-002: Preserve paused session data while disabled; block session start/resume.
- FR-003: Fold all descendants until the next sibling or enclosing block.
- FR-004: Keep fold state through overlay refreshes and isolate it per note.
- FR-005: Preserve source content, progress counts and access to running timers.

### Key Entities
Session preference; retained session; list parent and its descendants; view fold state.

## Success Criteria
Both toggle states survive settings reload. One click folds/unfolds all descendants.
Neither action loses task text, accumulated time or session progress.

## Assumptions
Fold state lasts for the lifetime of the overlay view. No sync with editor folds.
Ordinary timers remain available. No release or installation requested.
