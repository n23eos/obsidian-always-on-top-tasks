import { EventEmitter } from "node:events";
import vm from "node:vm";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import {
  installMainProcessQuitGuard,
  type MainProcessQuitGuard,
  type QuitGuardElectron,
  type QuitGuardOptions,
  type QuitGuardTimers,
} from "../src/quit/mainProcessGuard";

class FakeWindow extends EventEmitter {
  destroyed = false;
  webContents = Object.assign(new EventEmitter(), { send: vi.fn() });

  constructor(readonly id: number) { super(); }

  isDestroyed(): boolean { return this.destroyed; }
}

function harness(factory = installMainProcessQuitGuard) {
  const owner = new FakeWindow(1);
  const overlay = new FakeWindow(2);
  let windows = [owner, overlay];
  const app = Object.assign(new EventEmitter(), {
    quit: vi.fn(() => { beforeQuit(); }),
  });
  function beforeQuit() {
    const event = {
      defaultPrevented: false,
      preventDefault() { this.defaultPrevented = true; },
    };
    app.emit("before-quit", event);
    return event;
  }
  const testClock = { setTimeout, clearTimeout };
  const timers: QuitGuardTimers = {
    setTimeout: (callback, delay) => testClock.setTimeout(callback, delay),
    clearTimeout: (timer) => testClock.clearTimeout(timer as ReturnType<typeof setTimeout>),
  };
  const guard = factory(
    { app, BrowserWindow: { getAllWindows: () => windows } },
    timers,
    { ownerId: 1, overlayId: 2, prepareChannel: "prepare", timeoutMs: 1000 },
  )!;
  function nonce(): string {
    return owner.webContents.send.mock.calls.at(-1)![1] as string;
  }
  function closeAll() {
    owner.destroyed = true;
    overlay.destroyed = true;
    windows = [];
    owner.emit("closed");
    app.emit("window-all-closed");
  }
  return {
    app, owner, overlay, guard, beforeQuit, nonce, closeAll,
    setWindows(next: FakeWindow[]) { windows = next; },
  };
}

describe("main-process Quit guard", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  test("waits for durable acknowledgement, then retries once after native closure", () => {
    const h = harness();
    expect(h.beforeQuit().defaultPrevented).toBe(true);
    expect(h.app.quit).not.toHaveBeenCalled();
    expect(h.guard.confirmSaved(h.nonce())).toBe(true);
    expect(h.app.quit).toHaveBeenCalledTimes(1);
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).toHaveBeenCalledTimes(2);
    h.app.emit("window-all-closed");
    vi.runAllTimers();
    expect(h.app.quit).toHaveBeenCalledTimes(2);
    expect(h.app.listenerCount("before-quit")).toBe(0);
    expect(h.owner.listenerCount("closed")).toBe(0);
  });

  test("never retries without acknowledgement, even if windows disappear", () => {
    const h = harness();
    h.beforeQuit();
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).not.toHaveBeenCalled();
  });

  test("failed persistence cancels without touching windows", () => {
    const h = harness();
    h.beforeQuit();
    const nonce = h.nonce();
    h.guard.cancel(nonce);
    expect(h.guard.confirmSaved(nonce)).toBe(false);
    vi.runAllTimers();
    expect(h.owner.isDestroyed()).toBe(false);
    expect(h.app.quit).not.toHaveBeenCalled();
  });

  test("an earlier native veto leaves the initial Quit untouched", () => {
    const h = harness();
    h.app.prependListener("before-quit", (event: { preventDefault(): void }) => event.preventDefault());
    h.beforeQuit();
    expect(h.owner.webContents.send).not.toHaveBeenCalled();
  });

  test("a later initial listener prevents interception even if its veto runs only once", () => {
    const h = harness();
    h.app.once("before-quit", (event: { preventDefault(): void }) => event.preventDefault());
    expect(h.beforeQuit().defaultPrevented).toBe(true);
    expect(h.owner.webContents.send).not.toHaveBeenCalled();
    vi.runAllTimers();
    expect(h.app.quit).not.toHaveBeenCalled();
  });

  test("respects a later native veto on the acknowledged native Quit", () => {
    const h = harness();
    h.beforeQuit();
    h.app.on("before-quit", (event: { preventDefault(): void }) => event.preventDefault());
    h.guard.confirmSaved(h.nonce());
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).toHaveBeenCalledTimes(1);
  });

  test("foreign windows prevent arming and invalidate acknowledgement", () => {
    const h = harness();
    h.setWindows([h.owner, h.overlay, new FakeWindow(3)]);
    expect(h.beforeQuit().defaultPrevented).toBe(false);
    expect(h.owner.webContents.send).not.toHaveBeenCalled();
    h.setWindows([h.owner, h.overlay]);
    h.beforeQuit();
    h.setWindows([h.owner, h.overlay, new FakeWindow(3)]);
    expect(h.guard.confirmSaved(h.nonce())).toBe(false);
    expect(h.app.quit).not.toHaveBeenCalled();
  });

  test.each(["activate", "browser-window-created"])("%s cancels a pending final retry", (event) => {
    const h = harness();
    h.beforeQuit();
    h.guard.confirmSaved(h.nonce());
    h.app.emit(event);
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).toHaveBeenCalledTimes(1);
  });

  test("normal close without Quit never quits the app", () => {
    const h = harness();
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).not.toHaveBeenCalled();
    expect(h.app.listenerCount("before-quit")).toBe(0);
  });

  test("release during preparation cleans listeners and rejects late acknowledgements", () => {
    const h = harness();
    h.beforeQuit();
    const nonce = h.nonce();
    h.guard.release();
    expect(h.guard.confirmSaved(nonce)).toBe(false);
    expect(h.app.listenerCount("before-quit")).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("release during acknowledged closure preserves a bounded main-process retry", () => {
    const h = harness();
    h.beforeQuit();
    h.guard.confirmSaved(h.nonce());
    h.guard.release();
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).toHaveBeenCalledTimes(2);
  });

  test("release during a cancelled close removes remaining listeners at the deadline", () => {
    const h = harness();
    h.beforeQuit();
    h.guard.confirmSaved(h.nonce());
    h.guard.release();
    vi.advanceTimersByTime(1000);
    expect(h.app.listenerCount("before-quit")).toBe(0);
    expect(h.app.quit).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("host removal of the overlay leaf during closure preserves the saved scope", () => {
    const h = harness();
    h.beforeQuit();
    h.guard.confirmSaved(h.nonce());
    h.guard.setOverlay(null);
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).toHaveBeenCalledTimes(2);
  });

  test("timeout invalidates acknowledgements and does not force remaining windows", () => {
    const h = harness();
    h.beforeQuit();
    const oldNonce = h.nonce();
    vi.advanceTimersByTime(1000);
    expect(h.guard.confirmSaved(oldNonce)).toBe(false);
    expect(h.app.quit).not.toHaveBeenCalled();
    h.beforeQuit();
    expect(h.nonce()).not.toBe(oldNonce);
    h.guard.confirmSaved(h.nonce());
    vi.advanceTimersByTime(1000);
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).toHaveBeenCalledTimes(1);
  });

  test("duplicate Quit while preparing does not send another request", () => {
    const h = harness();
    h.beforeQuit();
    expect(h.beforeQuit().defaultPrevented).toBe(true);
    expect(h.owner.webContents.send).toHaveBeenCalledTimes(1);
    h.guard.confirmSaved(h.nonce());
    h.beforeQuit();
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).toHaveBeenCalledTimes(2);
  });

  test("will-quit cancels retry even when another listener vetoes final termination", () => {
    const h = harness();
    h.beforeQuit();
    h.guard.confirmSaved(h.nonce());
    h.app.emit("will-quit");
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).toHaveBeenCalledTimes(1);
  });

  test("render-process-gone disposes the guard", () => {
    const h = harness();
    h.beforeQuit();
    const nonce = h.nonce();
    h.owner.webContents.emit("render-process-gone");
    expect(h.guard.confirmSaved(nonce)).toBe(false);
    expect(h.app.listenerCount("before-quit")).toBe(0);
  });

  test.each([
    { name: "legacy positional", args: [{}, "app://obsidian.md/index.html", false, true, 1, 1] },
    { name: "event details", args: [{ isMainFrame: true, isSameDocument: false }] },
  ])("$name main-frame document navigation disposes the guard", ({ args }) => {
    const h = harness();
    h.beforeQuit();
    const nonce = h.nonce();
    h.owner.webContents.emit("did-start-navigation", ...args);
    expect(h.guard.confirmSaved(nonce)).toBe(false);
    expect(h.app.listenerCount("before-quit")).toBe(0);
  });

  test.each([
    { name: "legacy subframe", args: [{}, "about:blank", false, false, 1, 2] },
    { name: "subframe details", args: [{ isMainFrame: false, isSameDocument: false }] },
    { name: "legacy same-document", args: [{}, "app://obsidian.md/index.html#note", true, true, 1, 1] },
    { name: "same-document details", args: [{ isMainFrame: true, isSameDocument: true }] },
  ])("$name navigation preserves the renderer's guard", ({ args }) => {
    const h = harness();
    h.beforeQuit();
    h.owner.webContents.emit("did-start-navigation", ...args);
    expect(h.guard.confirmSaved(h.nonce())).toBe(true);
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).toHaveBeenCalledTimes(2);
  });

  test("factory runs in a new VM without renderer imports or closure dependencies", () => {
    const detached = vm.runInNewContext(`(${installMainProcessQuitGuard.toString()})`) as (
      electron: QuitGuardElectron, timers: QuitGuardTimers, options: QuitGuardOptions,
    ) => MainProcessQuitGuard | null;
    const h = harness(detached);
    h.beforeQuit();
    h.guard.confirmSaved(h.nonce());
    h.closeAll();
    vi.runAllTimers();
    expect(h.app.quit).toHaveBeenCalledTimes(2);
  });
});
