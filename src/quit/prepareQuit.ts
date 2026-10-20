interface PendingWorkSource {
  readonly pendingWork: Promise<void>;
}

/** Drains state queues and durably checkpoints the stable snapshot before quit. */
export async function prepareQuitState(
  focus: PendingWorkSource,
  timers: PendingWorkSource,
  checkpoint: () => Promise<void>,
  isCurrent: () => boolean,
): Promise<boolean> {
  while (isCurrent()) {
    const focusWork = focus.pendingWork;
    const timerWork = timers.pendingWork;
    await Promise.all([focusWork, timerWork]);
    if (!isCurrent()) return false;
    if (focus.pendingWork !== focusWork || timers.pendingWork !== timerWork) continue;

    await checkpoint();
    if (!isCurrent()) return false;
    if (focus.pendingWork !== focusWork || timers.pendingWork !== timerWork) continue;
    return true;
  }
  return false;
}
