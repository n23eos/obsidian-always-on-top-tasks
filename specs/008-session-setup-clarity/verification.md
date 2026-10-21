# Verification, 2026-10-21

221 tests, TypeScript, ESLint (no warnings), production build and diff check pass.
Four new panel tests cover one labeled input, count change and exact start
selection, fewer available tasks and disabled rendering. Defaults/migration/reset
and explicit opt-in are covered. Existing enabled-session regressions now opt in
explicitly rather than relying on the former default.

Browser CUA inspected setup at 240/340 px and changed count using the input.
Default-disabled fixture reset shows no setup. Screenshot: preview/setup.png.

Installed 0.10.0 into Raincoat with backup, safely disabled sessions through
updateSettings. The user's existing overlay remains open. Nine host checks pass:
actual overlay hides setup, native detached panel DOM contains one labeled input,
count 2 submits two synthetic tasks, disabled preference persisted. No user note
or task was changed by these checks. Results: native-results.json.

New/missing/invalid preferences and Reset to defaults disable Focus Sessions.
Existing explicit saved opt-in is retained by migration. Raincoat is explicitly
disabled as requested, with other preferences retained. Native mouse is unavailable.
Local unreleased 0.10.0 bundle/English notes refreshed; no commit/push/publication.
