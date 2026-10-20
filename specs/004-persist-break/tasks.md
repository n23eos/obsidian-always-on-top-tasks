# Tasks: Persistent breaks

## Setup

- [x] T001 Record requirements and design in specs/004-persist-break/.

## US1: Restore active break

Independent check: restart active break, then save the complete duration once.

- [x] T002 [US1] Validate and preserve break state in src/settings.ts.
- [x] T003 [US1] Restore persisted state and rename paths in src/TimerService.ts.
- [x] T004 [US1] Cover restart and migration in tests/TimerService.test.ts and tests/settings.test.ts.

## US2: Recover failed save

Independent check: restart after failed note write or cleanup, then retry once.

- [x] T005 [US2] Freeze and journal pending writes in src/TimerService.ts and src/core/breakLine.ts.
- [x] T006 [US2] Preserve failed stopped state in src/SettingsPersistence.ts.
- [x] T007 [US2] Cover pending recovery, double-count prevention and ambiguity in tests/TimerService.test.ts.

## Verification

- [x] T008 [P] Update README.md and .plan-obsidian.md.
- [x] T009 Review implementation and record checks/browser evidence in specs/004-persist-break/verification.md.
- [x] T010 Back up and update local installation; record runtime verification in specs/004-persist-break/verification.md.

Dependencies: setup -> US1 -> US2 -> verification. MVP is US1, delivery includes US2.
Parallel: documentation and UI preparation run alongside worker-owned core/tests.
