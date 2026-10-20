# Validation

Run npm test, npm run check, npm run lint, npm run build.
Run node scripts/ui-preview.mjs and visit http://127.0.0.1:4319 in CUA.

1. Select three tasks, start, complete one; verify 1/3 and next task.
2. Show all tasks; undo/recheck completion; count must not accumulate.
3. Pause, wait, reload fixture and resume; paused duration stays frozen.
4. Trigger simulated write failure before completing/finishing. Verify pending
   save, recover and retry without double time or premature summary.
5. Finish early and finish all tasks; inspect summary and new-session behavior.
6. Inspect at 240, 280 and 340 px in both themes, keyboard actions and console.
7. Native Electron always-on-top remains a separate Obsidian validation.
