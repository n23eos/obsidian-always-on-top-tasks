# Decisions

- Preserve epoch start and optional stop time, so restart needs no interval replay.
- Keep the note format unchanged. Persist recovery evidence before writing the
  note; compare current state with expected pre/post state before retrying.
- Fail conservatively on external edits or ambiguous coffee totals.
- Existing vault.process and settings queue are sufficient; no new API research
  or dependency is needed. Source: current TimerService and SettingsPersistence.
