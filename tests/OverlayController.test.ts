import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

const electron = vi.hoisted(() => ({
  applyOverlayGeometry: vi.fn(),
  blurWindow: vi.fn(),
  getBrowserWindowFor: vi.fn(),
  readBounds: vi.fn(),
  releaseWindow: vi.fn(),
  sameRect: vi.fn(),
  setPinned: vi.fn(),
}));
const notifications = vi.hoisted(() => ({ notify: vi.fn() }));

vi.mock("../src/electron", () => electron);
vi.mock("../src/notify", () => notifications);
vi.mock("../src/overlay/FocusOverlayView", () => ({
  FOCUS_OVERLAY_VIEW_TYPE: "tfa-focus-overlay",
}));

import { OverlayController } from "../src/overlay/OverlayController";
import { DEFAULT_SETTINGS } from "../src/settings";

type Callback = () => void;

function createLeaf(hostWindow: Window) {
  return {
    view: {
      containerEl: {
        win: hostWindow,
        isConnected: true,
      },
    },
    setViewState: vi.fn(async () => undefined),
    detach: vi.fn(),
  };
}

function createBrowserWindow(id: number) {
  return {
    id,
    getBounds: vi.fn(() => ({ x: 10, y: 20, width: 360, height: 700 })),
    setBounds: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    isAlwaysOnTop: vi.fn(() => true),
  };
}

function createHarness(
  restoredLeaves: ReturnType<typeof createLeaf>[] = [],
  layoutIsReady = false,
) {
  let layoutReady: Callback | undefined;
  let layoutChange: Callback | undefined;
  const openedLeaves: ReturnType<typeof createLeaf>[] = [];
  const workspace = {
    onLayoutReady: vi.fn((callback: Callback) => {
      layoutReady = callback;
      if (layoutIsReady) callback();
    }),
    on: vi.fn((_event: string, callback: Callback) => {
      layoutChange = callback;
      return { unload: vi.fn() };
    }),
    getLeavesOfType: vi.fn((viewType: string) =>
      viewType === "tfa-focus-overlay" ? restoredLeaves : []),
    openPopoutLeaf: vi.fn(() => {
      const leaf = openedLeaves.shift();
      if (!leaf) throw new Error("No popout leaf prepared");
      return leaf;
    }),
  };
  const plugin = {
    app: { workspace },
    settings: { ...DEFAULT_SETTINGS },
    registerEvent: vi.fn(),
    registerInterval: vi.fn(),
    patchSettings: vi.fn(async () => undefined),
    syncQuitWorkaround: vi.fn(),
  };
  const controller = new OverlayController(plugin as never);

  return {
    controller,
    plugin,
    workspace,
    openedLeaves,
    ready() {
      if (!layoutReady) throw new Error("Layout callback was not registered");
      layoutReady();
    },
    layoutChange() {
      if (!layoutChange) throw new Error("Layout change callback was not registered");
      layoutChange();
    },
  };
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal("window", {
    setInterval,
    setTimeout,
  });
  for (const mock of Object.values(electron)) mock.mockReset();
  notifications.notify.mockReset();
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("OverlayController", () => {
  test("updates quit scope when a delayed native window becomes available", async () => {
    const leaf = createLeaf({} as Window);
    const harness = createHarness();
    harness.openedLeaves.push(leaf);
    electron.getBrowserWindowFor.mockReturnValueOnce(null).mockReturnValue(createBrowserWindow(7));
    const opening = harness.controller.toggle({ path: "focus.md" } as never);
    await Promise.resolve();
    expect(harness.plugin.syncQuitWorkaround).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(75);
    await opening;
    expect(harness.plugin.syncQuitWorkaround).toHaveBeenCalledOnce();
  });

  test("adopts and re-pins the overlay restored by the workspace", async () => {
    const hostWindow = {} as Window;
    const restoredLeaf = createLeaf(hostWindow);
    const browserWindow = createBrowserWindow(1);
    electron.getBrowserWindowFor.mockReturnValue(browserWindow);
    const harness = createHarness([restoredLeaf], true);

    await Promise.resolve();

    expect(harness.controller.isOpen).toBe(true);
    expect(electron.applyOverlayGeometry).toHaveBeenCalledWith(
      browserWindow,
      hostWindow,
      expect.objectContaining({ pinned: true }),
    );

    await harness.controller.toggle({ path: "focus.md" } as never);

    expect(restoredLeaf.detach).toHaveBeenCalledOnce();
    expect(harness.workspace.openPopoutLeaf).not.toHaveBeenCalled();
    expect(harness.controller.isOpen).toBe(false);
  });

  test("adopts an overlay restored after layout ready on the next layout change", async () => {
    const hostWindow = {} as Window;
    const restoredLeaf = createLeaf(hostWindow);
    const browserWindow = createBrowserWindow(1);
    const restoredLeaves: ReturnType<typeof createLeaf>[] = [];
    electron.getBrowserWindowFor.mockReturnValue(browserWindow);
    const harness = createHarness(restoredLeaves);
    harness.ready();

    restoredLeaves.push(restoredLeaf);
    harness.layoutChange();
    await Promise.resolve();

    expect(harness.controller.isOpen).toBe(true);
    expect(electron.applyOverlayGeometry).toHaveBeenCalledWith(
      browserWindow,
      hostWindow,
      expect.objectContaining({ pinned: true }),
    );
  });

  test("does not re-adopt a detached overlay still reported during layout change", () => {
    const restoredLeaf = createLeaf({} as Window);
    electron.getBrowserWindowFor.mockReturnValue(createBrowserWindow(1));
    const harness = createHarness([restoredLeaf], true);

    harness.controller.close();
    harness.layoutChange();

    expect(harness.controller.isOpen).toBe(false);
    expect(restoredLeaf.detach).toHaveBeenCalledOnce();
    expect(harness.workspace.openPopoutLeaf).not.toHaveBeenCalled();
  });

  test("an old pin retry cannot replace the browser window of a newer overlay", async () => {
    const firstHost = {} as Window;
    const secondHost = {} as Window;
    const firstLeaf = createLeaf(firstHost);
    const secondLeaf = createLeaf(secondHost);
    const firstWindow = createBrowserWindow(1);
    const secondWindow = createBrowserWindow(2);
    let firstAttempts = 0;
    electron.getBrowserWindowFor.mockImplementation((hostWindow: Window) => {
      if (hostWindow === secondHost) return secondWindow;
      firstAttempts += 1;
      return firstAttempts === 1 ? null : firstWindow;
    });
    const harness = createHarness();
    harness.openedLeaves.push(firstLeaf, secondLeaf);
    harness.ready();

    const firstOpen = harness.controller.toggle({ path: "first.md" } as never);
    await Promise.resolve();
    harness.controller.close();
    await harness.controller.toggle({ path: "second.md" } as never);

    await vi.advanceTimersByTimeAsync(75);
    await firstOpen;

    expect(electron.applyOverlayGeometry).toHaveBeenCalledTimes(1);
    expect(electron.applyOverlayGeometry).toHaveBeenCalledWith(
      secondWindow,
      secondHost,
      expect.any(Object),
    );
    expect(electron.releaseWindow).not.toHaveBeenCalledWith(firstWindow);
  });

  test("release cancels a pending pin retry", async () => {
    const hostWindow = {} as Window;
    const leaf = createLeaf(hostWindow);
    const browserWindow = createBrowserWindow(1);
    electron.getBrowserWindowFor
      .mockReturnValueOnce(null)
      .mockReturnValue(browserWindow);
    const harness = createHarness();
    harness.openedLeaves.push(leaf);
    harness.ready();

    const open = harness.controller.toggle({ path: "focus.md" } as never);
    await Promise.resolve();
    harness.controller.release();
    await vi.advanceTimersByTimeAsync(75);
    await open;

    expect(electron.getBrowserWindowFor).toHaveBeenCalledOnce();
    expect(electron.applyOverlayGeometry).not.toHaveBeenCalled();
    expect(notifications.notify).not.toHaveBeenCalled();
  });
});
