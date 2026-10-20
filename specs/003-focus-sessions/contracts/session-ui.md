# Session UI contract

Idle: goal presets 1/3/5, custom 1..20 goal, selectable eligible task rows, one-click start.
Active: selected completion count, session time, current task, remaining queue,
focus/full-note toggle, pause and finish. New tasks do not alter the active goal.
Paused: frozen session time and explicit resume; timer writes remain retryable.
Goal reached: calm completion message and explicit finish.
Finished: saved summary and new-session action. No streak or punitive failure copy.
Different note: show session note and explicit return action; never overwrite it.
Unavailable task: clear explanation, show full note or finish early.
