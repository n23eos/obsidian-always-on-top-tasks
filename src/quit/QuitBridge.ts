export interface QuitGuardApi {
  setOverlay(id: number | null): void;
  confirmSaved(nonce: string): void;
  cancel(nonce: string): void;
  release(): void;
}
export interface QuitIpc {
  on(channel: string, callback: (event: unknown, nonce: unknown) => void): void;
  removeListener(channel: string, callback: (event: unknown, nonce: unknown) => void): void;
}
export class QuitBridge {
  private disposed = false;
  private pending: string | null = null;

  constructor(
    private readonly guard: QuitGuardApi,
    private readonly ipc: QuitIpc,
    private readonly channel: string,
    private readonly prepare: (isCurrent: () => boolean) => Promise<boolean>,
    private readonly onError: (error: unknown) => void,
  ) {
    ipc.on(channel, this.onPrepare);
  }

  private readonly onPrepare = (_event: unknown, nonce: unknown): void => {
    if (this.disposed || typeof nonce !== "string" || !nonce) return;
    this.pending = nonce;
    void this.prepareRequest(nonce);
  };

  private async prepareRequest(nonce: string): Promise<void> {
    const current = () => !this.disposed && this.pending === nonce;
    try {
      const saved = await this.prepare(current);
      if (!current()) return;
      if (saved) this.guard.confirmSaved(nonce);
      else this.guard.cancel(nonce);
    } catch (error) {
      if (!current()) return;
      try { this.guard.cancel(nonce); } catch { /* Native deadline also retires a disconnected guard. */ }
      this.onError(error);
    } finally {
      if (this.pending === nonce) this.pending = null;
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    this.pending = null;
    this.ipc.removeListener(this.channel, this.onPrepare);
    try { this.guard.release(); } catch { /* The native process may already be closing. */ }
  }
}
