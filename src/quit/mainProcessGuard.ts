type Listener = (...args: unknown[]) => void;

interface EventSource {
  on(event: string, listener: Listener): unknown;
  removeListener(event: string, listener: Listener): unknown;
}

interface QuitEvent {
  defaultPrevented: boolean;
  preventDefault(): void;
}

interface GuardWindow extends EventSource {
  id: number;
  isDestroyed(): boolean;
  webContents: EventSource & {
    send(channel: string, nonce: string): void;
  };
}

export interface QuitGuardElectron {
  app: EventSource & {
    quit(): void;
    listeners(event: string): unknown[];
  };
  BrowserWindow: { getAllWindows(): GuardWindow[] };
}

export interface QuitGuardTimers {
  setTimeout(callback: () => void, delay: number): unknown;
  clearTimeout(timer: unknown): void;
}

export interface QuitGuardOptions {
  ownerId: number;
  overlayId: number | null;
  prepareChannel: string;
  timeoutMs?: number;
}

export interface MainProcessQuitGuard {
  setOverlay(id: number | null): void;
  confirmSaved(nonce: string): boolean;
  cancel(nonce: string): void;
  release(): void;
}

/**
 * This factory must remain self-contained: the bridge executes its source in
 * the main process. Never pass a renderer callback to its event subscriptions.
 * The bridge gates the supported platform and host versions before installation.
 */
export function installMainProcessQuitGuard(
  electron: QuitGuardElectron,
  timers: QuitGuardTimers,
  options: QuitGuardOptions,
): MainProcessQuitGuard | null {
  const { app, BrowserWindow } = electron;
  const candidate = BrowserWindow.getAllWindows().find((win) => win.id === options.ownerId);
  if (!candidate || candidate.isDestroyed()) return null;
  const owner: GuardWindow = candidate;

  let phase: "idle" | "preparing" | "closing" | "disposed" = "idle";
  let overlayId = options.overlayId;
  let nonce: string | null = null;
  let generation = 0;
  let beforeQuitAccepted = false;
  let allClosed = false;
  let retryScheduled = false;
  let rendererReleased = false;
  const handles = new Set<unknown>();
  const subscriptions: { source: EventSource; event: string; listener: Listener }[] = [];
  const instance = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const timeoutMs = options.timeoutMs ?? 10000;

  function listen(source: EventSource, event: string, listener: Listener): void {
    source.on(event, listener);
    subscriptions.push({ source, event, listener });
  }

  function later(callback: () => void, delay: number): void {
    const handle = timers.setTimeout(() => {
      handles.delete(handle);
      callback();
    }, delay);
    handles.add(handle);
  }

  function clearTimers(): void {
    for (const handle of handles) timers.clearTimeout(handle);
    handles.clear();
  }

  function dispose(): void {
    if (phase === "disposed") return;
    phase = "disposed";
    nonce = null;
    generation++;
    clearTimers();
    for (const { source, event, listener } of subscriptions) {
      source.removeListener(event, listener);
    }
    subscriptions.length = 0;
  }

  function reset(): void {
    if (phase === "disposed") return;
    if (rendererReleased || owner.isDestroyed()) {
      dispose();
      return;
    }
    phase = "idle";
    nonce = null;
    generation++;
    beforeQuitAccepted = false;
    allClosed = false;
    retryScheduled = false;
    clearTimers();
  }

  function windows(): GuardWindow[] {
    return BrowserWindow.getAllWindows().filter((win) => !win.isDestroyed());
  }

  function exactScope(): boolean {
    if (overlayId === null || overlayId === options.ownerId) return false;
    const current = windows();
    return current.length === 2
      && current.some((win) => win.id === options.ownerId)
      && current.some((win) => win.id === overlayId);
  }

  function foreignWindowExists(): boolean {
    return windows().some((win) => win.id !== options.ownerId && win.id !== overlayId);
  }

  function completeIfClosed(): void {
    if (phase !== "closing" || !beforeQuitAccepted || !allClosed || retryScheduled) return;
    if (windows().length !== 0) {
      reset();
      return;
    }
    retryScheduled = true;
    const attempt = generation;
    later(() => {
      if (phase !== "closing" || generation !== attempt) return;
      if (windows().length !== 0) {
        reset();
        return;
      }
      // Remove every listener first. A veto of this final native Quit is final.
      dispose();
      app.quit();
    }, 0);
  }

  function onBeforeQuit(value: unknown): void {
    const event = value as QuitEvent;
    if (phase === "disposed") return;
    if (phase === "closing") {
      if (event.defaultPrevented) {
        reset();
        return;
      }
      beforeQuitAccepted = false;
      const attempt = generation;
      // Later listeners may veto this same event.
      later(() => {
        if (phase !== "closing" || generation !== attempt) return;
        if (event.defaultPrevented) {
          reset();
          return;
        }
        beforeQuitAccepted = true;
        completeIfClosed();
      }, 0);
      return;
    }
    if (phase === "preparing") {
      event.preventDefault();
      return;
    }
    if (event.defaultPrevented || !exactScope()) return;
    // Only intercept after every other registered handler has had its veto.
    // If another plugin subscribed later, leave Quit entirely to the host.
    const handlers = app.listeners("before-quit");
    if (handlers[handlers.length - 1] !== onBeforeQuit) return;
    // Keep the original windows and host beforeunload hooks intact until the
    // renderer has durably saved its already queued work.
    event.preventDefault();
    phase = "preparing";
    nonce = `${instance}-${++generation}`;
    const attempt = generation;
    later(() => {
      if (generation === attempt) reset();
    }, timeoutMs);
    try {
      owner.webContents.send(options.prepareChannel, nonce);
    } catch {
      reset();
    }
  }

  listen(app, "before-quit", onBeforeQuit);
  listen(app, "will-quit", dispose);
  listen(app, "window-all-closed", () => {
    if (phase !== "closing") {
      if (phase === "preparing") reset();
      return;
    }
    allClosed = true;
    completeIfClosed();
  });
  listen(app, "activate", reset);
  listen(app, "browser-window-created", reset);
  listen(owner, "closed", () => {
    if (phase !== "closing" || foreignWindowExists()) dispose();
  });
  listen(owner.webContents, "render-process-gone", dispose);
  listen(owner.webContents, "did-start-navigation", (details, _url, isInPlace, isMainFrame) => {
    const navigation = details && typeof details === "object"
      ? details as { isMainFrame?: boolean; isSameDocument?: boolean }
      : {};
    const mainFrame = navigation.isMainFrame ?? isMainFrame;
    const sameDocument = navigation.isSameDocument ?? isInPlace;
    // Iframes and same-document navigation do not replace our renderer context.
    if (mainFrame === true && sameDocument !== true) dispose();
  });

  return {
    setOverlay(id): void {
      if (phase === "disposed") return;
      // Host closure removes the overlay leaf before all windows are gone.
      // Preserve the window IDs captured for this acknowledged Quit.
      if (phase === "closing" && id === null) return;
      if (overlayId !== id && phase !== "idle") reset();
      overlayId = id;
    },
    confirmSaved(savedNonce): boolean {
      if (phase !== "preparing" || nonce !== savedNonce) return false;
      if (!exactScope()) {
        reset();
        return false;
      }
      phase = "closing";
      app.quit();
      return true;
    },
    cancel(cancelledNonce): void {
      if (nonce === cancelledNonce) reset();
    },
    release(): void {
      // An acknowledged Quit must outlive the renderer that is closing.
      // During preparation, disabling/reloading the plugin cancels the attempt.
      rendererReleased = true;
      if (phase !== "closing") dispose();
    },
  };
}
