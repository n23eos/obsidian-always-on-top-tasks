# Clear session setup and opt-in default

Created: 2026-10-21. Input: remove duplicate task count controls, explain the count,
and turn Focus Sessions off by default.

## Scenarios and requirements
- Users see one labeled numeric control for task count (1-20), not duplicate presets.
- Setup explains that the first open tasks are selected automatically. Users can
  choose specific tasks using the existing Choose tasks button.
- Empty/invalid counts do not start an empty session. A smaller available list
  selects only available tasks and shows the actual count in the numeric control.
- New installations, missing/invalid preferences and Reset to defaults disable
  sessions. Explicit saved opt-in remains supported.
- Raincoat is switched off as directly requested; existing session/timer data is
  preserved through the established disable flow.

## Success criteria
One labeled count input, valid selection/start behavior, no duplicate preset
buttons, opt-in migration tests pass, installed Raincoat defaults to hidden setup.
