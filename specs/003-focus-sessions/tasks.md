# Tasks: Focus sessions

## Setup

- [x] T001 Record specification and design in specs/003-focus-sessions/.

## Foundation

- [x] T002 Implement task scanning, matching and duration in src/core/focusSession.ts.
- [x] T003 Add state validation and reset preservation in src/settings.ts.

## US1: Choose a goal

Independent check: start three selected open tasks with progress 0/3.

- [x] T004 [US1] Implement safe session start in src/FocusSessionService.ts.
- [x] T005 [P] [US1] Build selection and goal controls in src/overlay/FocusSessionPanel.ts.
- [x] T006 [US1] Cover selection/migration in tests/focusSession.test.ts and tests/settings.test.ts.

## US2: One next action

Independent check: complete/undo/recheck selected work without inflating progress.

- [x] T007 [US2] Integrate focus filtering, selection and inline reanchor in src/overlay/FocusOverlayView.ts.
- [x] T008 [P] [US2] Style session controls at narrow widths in styles.css.
- [x] T009 [US2] Synchronize external note changes in src/main.ts.

## US3: Pause and finish

Independent check: pause/reload/resume and failed-save/finish scenarios.

- [x] T010 [US3] Implement paused/finished lifecycle in src/FocusSessionService.ts.
- [x] T011 [US3] Cover lifecycle and write failures in tests/FocusSessionService.test.ts.
- [x] T012 [P] [US3] Add reloadable session fixture in scripts/ui/preview.mjs.

## Verification

- [x] T013 Run checks and browser scenarios; record specs/003-focus-sessions/verification.md.
- [x] T014 Review final changes and update README.md and .plan-obsidian.md.

Dependencies: foundation -> US1 -> US2/US3 -> verification.
Parallel work: domain/service/settings and UI/style/main have separate owners.
MVP: US1; this task delivers all three stories. No publication step.
