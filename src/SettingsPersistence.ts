import type { PluginSettings } from "./settings";

interface SettingsHost {
  get: () => PluginSettings;
  set: (settings: PluginSettings) => void;
  save: (settings: PluginSettings) => Promise<void>;
}

/** Merge each patch after the preceding write has settled, never into a failed snapshot. */
export class SettingsPersistence {
  private queue: Promise<void> = Promise.resolve();

  constructor(private readonly host: SettingsHost) {}

  patch(patch: Partial<PluginSettings>): Promise<void> {
    const operation = this.queue.then(async () => {
      const current = this.host.get();
      const next = { ...current, ...patch };
      try {
        await this.host.save(next);
      } catch (error) {
        // A stopped timer must remain frozen and retryable even if its write fails.
        // Clearing a timer or changing session lifecycle only publishes on success.
        const recovery: Partial<PluginSettings> = {};
        if (patch.runningTimer) recovery.runningTimer = patch.runningTimer;
        if (patch.breakTimer
          && (patch.breakTimer.stoppedAt !== undefined || current.breakTimer !== null)) {
          recovery.breakTimer = patch.breakTimer;
        }
        if (Object.keys(recovery).length > 0) {
          this.host.set({ ...this.host.get(), ...recovery });
        }
        throw error;
      }
      this.host.set({ ...this.host.get(), ...patch });
    });
    this.queue = operation.catch(() => undefined);
    return operation;
  }
}
