import { describe, expect, test, vi } from "vitest";
import {
  applyOverlayGeometry,
  type ElectronBrowserWindow,
  type ElectronRect,
  type OverlayGeometry,
} from "../src/electron";

const WORK_AREA: ElectronRect = { x: 100, y: 40, width: 1400, height: 900 };

function createBrowserWindow(bounds: ElectronRect = { x: 0, y: 0, width: 340, height: 700 }) {
  return {
    id: 1,
    getBounds: vi.fn(() => bounds),
    setBounds: vi.fn(),
    setAlwaysOnTop: vi.fn(),
    isAlwaysOnTop: vi.fn(() => true),
    setVisibleOnAllWorkspaces: vi.fn(),
    setOpacity: vi.fn(),
  } satisfies ElectronBrowserWindow;
}

function createHostWindow(workArea = WORK_AREA): Window {
  return {
    electron: {
      remote: {
        screen: {
          getDisplayMatching: vi.fn(() => ({ workArea })),
        },
      },
    },
  } as unknown as Window;
}

function geometry(patch: Partial<OverlayGeometry> = {}): OverlayGeometry {
  return {
    edge: "right",
    width: 340,
    height: null,
    opacity: 0.95,
    margin: 12,
    freeBounds: null,
    pinned: true,
    ...patch,
  };
}

describe("applyOverlayGeometry", () => {
  test("keeps full work-area height as the default docked behavior", () => {
    const browserWindow = createBrowserWindow();

    expect(applyOverlayGeometry(browserWindow, createHostWindow(), geometry())).toBe(true);

    expect(browserWindow.setBounds).toHaveBeenCalledWith({
      x: 1148,
      y: 52,
      width: 340,
      height: 876,
    });
  });

  test("uses a configured docked height and clamps it to the work area", () => {
    const customWindow = createBrowserWindow();
    applyOverlayGeometry(customWindow, createHostWindow(), geometry({ edge: "left", height: 600 }));
    expect(customWindow.setBounds).toHaveBeenCalledWith({
      x: 112,
      y: 52,
      width: 340,
      height: 600,
    });

    const clampedWindow = createBrowserWindow();
    applyOverlayGeometry(clampedWindow, createHostWindow(), geometry({ height: 1200 }));
    expect(clampedWindow.setBounds).toHaveBeenCalledWith(expect.objectContaining({ height: 876 }));
  });

  test("preserves the saved manual size in free mode", () => {
    const freeBounds = { x: 240, y: 160, width: 515, height: 455 };
    const browserWindow = createBrowserWindow(freeBounds);

    applyOverlayGeometry(
      browserWindow,
      createHostWindow(),
      geometry({ edge: null, height: 600, freeBounds }),
    );

    expect(browserWindow.setBounds).toHaveBeenCalledWith(freeBounds);
  });
});
