# Feature Specification: Focus sessions with a task goal

**Feature Branch**: existing working branch
**Created**: 2026-10-20
**Status**: Ready for implementation
**Input**: Make the plugin useful and pleasant for focus sessions aimed at completing a specific number of tasks.

## User Scenarios & Testing

### User Story 1 - Choose a small finish line (Priority: P1)

Choose 1, 3, 5 or a custom selection of up to 20 open tasks from the pinned note.
Start a session with a clear task goal and start timing the first selected task.

**Independent Test**: Choose three tasks in a note with previously completed work.
Start the session and verify that progress starts at 0/3 and the first task is visible.

**Acceptance Scenarios**:

1. Given open tasks, starting with the default selection creates a three-task session, or fewer when fewer eligible tasks exist.
2. Given a custom selection, only selected tasks contribute to the goal.
3. Given checked tasks or examples inside code blocks, these cannot be enrolled.

### User Story 2 - Keep the next action visible (Priority: P1)

The active session presents the current task, remaining queue and progress.
A focus-only view hides unrelated work. Completing a task reveals the next action
without automatically starting its timer. The full note remains accessible.

**Independent Test**: Complete, uncheck and recheck a selected task; progress remains
the actual number of completed selected tasks, never an accumulated click count.

**Acceptance Scenarios**:

1. Given a three-task session, completing the first task yields 1/3 and a clear next task.
2. Given hidden unrelated tasks, adding a new task keeps it outside the current goal.
3. Given a changed, removed or ambiguous task, show a recovery explanation and do not award completion.

### User Story 3 - Pause, return and finish (Priority: P2)

Pause the session for a break, return to the selected work, and explicitly finish
with a summary of completed tasks and session time. State survives restarting the app.

**Independent Test**: Pause for one minute, restart, resume and finish early.
The pause must not increase session time; unfinished work stays unchecked.

**Acceptance Scenarios**:

1. Given a failed timer write, finishing remains retryable and cannot discard time.
2. Given a renamed note or parent folder, the session follows that note.
3. Given all selected tasks complete, freeze session time, show goal reached and an explicit finish action.
4. Given a finished summary, starting a new session uses only currently open tasks.

### Edge Cases

- Empty note, no eligible tasks, duplicate task titles, moved lines, custom emoji palettes.
- External checkbox changes, task deletion, inline rename, completed-task undo.
- Rapid clicks, persistence errors, pending timer saves, restart and reset settings.
- Opening a different note during a session must not silently move the session.
- Narrow 240/280 px overlays, keyboard access, light/dark themes and reduced motion.

## Requirements

### Functional Requirements

- **FR-001**: Offer one session at a time, with 1 to 20 selected initially open tasks.
- **FR-002**: Keep the task goal fixed during a session and count only selected tasks.
- **FR-003**: Provide focus-only and full-note views, a current action and a remaining queue.
- **FR-004**: Pause and finish through the existing safe timer-save flow.
- **FR-005**: Preserve the active session and completed summary across restart and settings reset.
- **FR-006**: Keep notes readable as ordinary Markdown without inserted task IDs.
- **FR-007**: Exclude ambiguous duplicate titles from enrollment with an explanation.
- **FR-008**: Identify missing or ambiguous enrolled tasks without falsely completing them.
- **FR-009**: Exclude paused time from the session clock; label it session time, not productivity.
- **FR-010**: Keep finished summaries stable until the next session is requested.
- **FR-011**: Use accessible buttons, labels and theme colors; avoid forced countdowns and celebrations.
- **FR-012**: Verify session accounting and failure recovery with regression tests and the actual overlay in the browser fixture.

### Key Entities

- Focus session: pinned note, selected tasks, lifecycle, start/end times and active duration.
- Selected task: task text, current location, completed or unavailable state.
- Summary: final count, goal and session duration.

## Success Criteria

- **SC-001**: Start a default session with one click when eligible tasks exist.
- **SC-002**: At 240 px, the current task and every session action remain reachable without horizontal scrolling.
- **SC-003**: Repeated completion/undo cycles never credit more than one completion per selected task.
- **SC-004**: A restarted paused session retains its goal, task progress and frozen duration.
- **SC-005**: Failed saves retain recoverable state and never produce a success summary.

## Assumptions

- Existing English product labels remain consistent; implementation reports are Russian.
- The note defines task order; selection provides a small work queue.
- A session clock measures active session wall time, including transitions between tasks.
- External task-title changes can require restoring the title or ending early.
- Native window behavior remains platform dependent; no release or external publication is requested.
