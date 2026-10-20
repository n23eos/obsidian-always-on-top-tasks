# Data model

PluginSettings.breakTimer is null or PersistedBreak:

- filePath: nonempty string.
- startedAt: nonnegative integer epoch milliseconds.
- stoppedAt: optional nonnegative integer at or after startedAt.
- commit: optional BreakCommitJournal, valid only with stoppedAt.

Journal stores lineNo and beforeTotalSeconds (both null when no coffee line
existed), plus afterTotalSeconds = previous total + floor((stop-start)/1000).
Invalid combinations migrate to null without changing other settings.

Transitions: absent -> active -> stopped/pending -> absent. Failed writes retain
pending state; restart reconstructs the same transition. Rename changes only path.
The journal is durably saved before each note mutation, including retries.
