# Data model

FocusSession: filePath; tasks (1..20); status active/paused/finished; startedAt;
activeSince nullable; elapsedMs nonnegative; finishedAt nullable.
FocusTask: lineNo, lineText, text, done, missing. Goal equals immutable task count.
FocusCandidate: lineNo, lineText, text, checked, eligible. Scanner omits frontmatter
and fenced code. Eligibility requires an unchecked task with a unique title.
Settings: focusSession nullable; focusTaskGoal integer 1..20 default 3;
focusOnly boolean default true. Reset preserves session; migration validates it.
Transitions: idle -> active -> paused -> active; active/paused -> finished -> idle.
Finished summaries are immutable. Missing/ambiguous tasks are not credited.
