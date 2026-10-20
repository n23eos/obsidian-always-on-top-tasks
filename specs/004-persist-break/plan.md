# Plan: Persistent breaks

2026-10-20. Spec: [spec.md](spec.md). Existing working branch: main.

## Summary and technical context

Extend existing TypeScript TimerService and SettingsPersistence using the existing
Obsidian vault.process API, Vitest, ESLint and esbuild. No dependency changes.
Persist break state in data.json; retain the readable coffee line in Markdown.

## Constitution check

Plain Markdown, conservative recovery, serialized mutations and preserved user
settings apply. Existing focus-session changes remain intact. No new API needed.

## Structure and phases

1. Add validated break state to settings and preserve it on reset.
2. Persist start and frozen stop through the timer operation queue. Journal enough
   evidence before the note write to distinguish not-yet-written/already-written
   totals conservatively. Preserve pending state on failed cleanup.
3. Cover reconstruction from saved state, failures, rename and compatibility.
4. Verify real production UI fixture reload, checks and local installation.

Owner split: worker owns timer/settings/core/tests. Root owns documentation,
UI verification and installation. Independent review follows implementation.

## Validation

npm test; npm run check; npm run lint; npm run build; git diff --check.
Browser reload during active break and pending failed save. Native reload after
backup without discarding any active old in-memory break.
