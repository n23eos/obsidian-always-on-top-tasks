import { EventEmitter } from "node:events";
import { describe, expect, test, vi } from "vitest";
import { QuitBridge } from "../src/quit/QuitBridge";

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function harness() {
  const ipc = new EventEmitter();
  const guard = { setOverlay: vi.fn(), confirmSaved: vi.fn(), cancel: vi.fn(), release: vi.fn() };
  const save = deferred<boolean>();
  const onError = vi.fn();
  let current: (() => boolean) | undefined;
  const bridge = new QuitBridge(guard, ipc, "prepare", (isCurrent) => {
    current = isCurrent;
    return save.promise;
  }, onError);
  return { ipc, guard, save, onError, bridge, current: () => current?.() };
}

describe("QuitBridge", () => {
  test("acknowledges the request only after durable preparation completes", async () => {
    const h = harness();
    h.ipc.emit("prepare", {}, "request-1");
    expect(h.current()).toBe(true);
    expect(h.guard.confirmSaved).not.toHaveBeenCalled();
    h.save.resolve(true);
    await h.save.promise;
    expect(h.guard.confirmSaved).toHaveBeenCalledWith("request-1");
    h.bridge.dispose();
  });
  test("failed saving cancels preparation instead of allowing quit", async () => {
    const h = harness();
    h.ipc.emit("prepare", {}, "request-2");
    h.save.reject(new Error("disk full"));
    await h.save.promise.catch(() => undefined);
    expect(h.guard.confirmSaved).not.toHaveBeenCalled();
    expect(h.guard.cancel).toHaveBeenCalledWith("request-2");
    expect(h.onError).toHaveBeenCalled();
    h.bridge.dispose();
  });
  test("unloading removes IPC and invalidates a late successful save", async () => {
    const h = harness();
    h.ipc.emit("prepare", {}, "request-3");
    h.bridge.dispose();
    expect(h.current()).toBe(false);
    h.save.resolve(true);
    await h.save.promise;
    expect(h.guard.confirmSaved).not.toHaveBeenCalled();
    expect(h.guard.release).toHaveBeenCalledOnce();
    expect(h.ipc.listenerCount("prepare")).toBe(0);
  });
  test("a canceled preparation cannot confirm a successful shutdown", async () => {
    const h = harness();
    h.ipc.emit("prepare", {}, "request-4");
    h.save.resolve(false);
    await h.save.promise;
    expect(h.guard.confirmSaved).not.toHaveBeenCalled();
    expect(h.guard.cancel).toHaveBeenCalledWith("request-4");
    h.bridge.dispose();
  });
  test("unavailable remote cancellation still reports the save failure", async () => {
    const h = harness();
    h.guard.cancel.mockImplementation(() => { throw new Error("remote unavailable"); });
    h.ipc.emit("prepare", {}, "request-5");
    h.save.reject(new Error("disk full"));
    await h.save.promise.catch(() => undefined);
    expect(h.onError).toHaveBeenCalledWith(expect.objectContaining({ message: "disk full" }));
    h.bridge.dispose();
  });
  test("unavailable remote release does not interrupt renderer cleanup", () => {
    const h = harness();
    h.guard.release.mockImplementation(() => { throw new Error("remote unavailable"); });
    expect(() => h.bridge.dispose()).not.toThrow();
    expect(h.ipc.listenerCount("prepare")).toBe(0);
  });

});
