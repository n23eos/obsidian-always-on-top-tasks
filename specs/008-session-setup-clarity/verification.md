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

## Release 0.10.0 published, 2026-10-21

Published on the owner's explicit request. Release commit 1cb31753f465d7fe5d15afd68e364744202cfe09
and tag 0.10.0 pushed. GitHub Actions 39640235853 succeeded, including tests,
typecheck, lint, build and provenance attestation. All 221 local tests passed.
English release body matches docs/releases/0.10.0.md. Downloaded main.js,
manifest.json and styles.css byte-match the local build and Raincoat installation.
Release: https://github.com/n23eos/obsidian-always-on-top-tasks/releases/tag/0.10.0
The native input and platform limitations recorded above remain unchanged.
