// Доступ к Electron BrowserWindow. Не публичный API Obsidian:
// всё в try/catch, при провале возвращаем null — плагин живёт без always-on-top.
// Подход к резолву remote взят из obsidian-synaptic-hatch (MIT).

export interface ElectronRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ElectronBrowserWindow {
  id: number;
  getBounds(): ElectronRect;
  setBounds(bounds: ElectronRect): void;
  setAlwaysOnTop(flag: boolean, level?: string): void;
  isAlwaysOnTop(): boolean;
  setVisibleOnAllWorkspaces?(visible: boolean, options?: { visibleOnFullScreen?: boolean }): void;
  setOpacity?(opacity: number): void;
  setIgnoreMouseEvents?(ignore: boolean): void;
  setFocusable?(focusable: boolean): void;
  setSkipTaskbar?(skip: boolean): void;
  blur?(): void;
  isDestroyed?(): boolean;
}

interface ElectronDisplay {
  workArea: ElectronRect;
}

interface ElectronScreen {
  getDisplayMatching(rect: ElectronRect): ElectronDisplay;
}

interface ElectronRemote {
  getCurrentWindow?(): ElectronBrowserWindow | null;
  screen?: ElectronScreen;
  BrowserWindow?: {
    getAllWindows(): ElectronBrowserWindow[];
  };
}

type RequireFn = (moduleId: string) => unknown;

function resolveRemote(candidate: unknown): ElectronRemote | null {
  if (!candidate || typeof candidate !== "object") return null;
  const module = candidate as ElectronRemote & { remote?: ElectronRemote };
  if (module.getCurrentWindow || module.BrowserWindow) return module;
  if (module.remote) return module.remote;
  return null;
}

/** Резолвит remote-модуль в контексте конкретного окна (главного или popout). */
function getRemoteFor(win: Window): ElectronRemote | null {
  const globalWin = win as Window & {
    electron?: { remote?: ElectronRemote };
    require?: RequireFn;
  };

  if (globalWin.electron?.remote) return globalWin.electron.remote;
  if (!globalWin.require) return null;

  for (const moduleId of ["@electron/remote", "electron"]) {
    try {
      const resolved = resolveRemote(globalWin.require(moduleId));
      if (resolved) return resolved;
    } catch {
      // пробуем следующий модуль
    }
  }
  return null;
}

/** BrowserWindow, которому принадлежит данный DOM Window (например, popout). */
export function getBrowserWindowFor(win: Window): ElectronBrowserWindow | null {
  const remote = getRemoteFor(win);
  if (!remote?.getCurrentWindow) return null;
  try {
    return remote.getCurrentWindow() ?? null;
  } catch {
    return null;
  }
}

export type OverlayEdge = "left" | "right";

export interface OverlayGeometry {
  edge: OverlayEdge;
  width: number;
  opacity: number; // 0..1
  margin: number;
}

/**
 * Прижимает окно к краю экрана, ставит поверх всех (включая полноэкранные
 * приложения) и применяет прозрачность. true = всё применилось.
 */
export function applyOverlayGeometry(
  browserWindow: ElectronBrowserWindow,
  hostWin: Window,
  geometry: OverlayGeometry,
): boolean {
  try {
    const remote = getRemoteFor(hostWin);
    const workArea = remote?.screen?.getDisplayMatching(browserWindow.getBounds()).workArea;

    if (workArea) {
      const x =
        geometry.edge === "right"
          ? workArea.x + workArea.width - geometry.width - geometry.margin
          : workArea.x + geometry.margin;
      browserWindow.setBounds({
        x,
        y: workArea.y + geometry.margin,
        width: geometry.width,
        height: workArea.height - geometry.margin * 2,
      });
    }

    // 'screen-saver' — чтобы держаться над полноэкранными приложениями (macOS)
    browserWindow.setAlwaysOnTop(true, "screen-saver");
    browserWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    browserWindow.setOpacity?.(geometry.opacity);
    return true;
  } catch (error) {
    console.error("Tasks for Focus ADHD: failed to apply overlay geometry", error);
    return false;
  }
}

/** Снимает always-on-top (при закрытии overlay / выгрузке плагина). */
export function releaseWindow(browserWindow: ElectronBrowserWindow): void {
  try {
    if (browserWindow.isDestroyed?.()) return;
    browserWindow.setAlwaysOnTop(false);
    browserWindow.setVisibleOnAllWorkspaces?.(false);
    browserWindow.setOpacity?.(1);
  } catch {
    // окно уже закрыто — нечего снимать
  }
}

/** Уводит фокус с окна после клика по кнопке (не держим фокус на overlay). */
export function blurWindow(browserWindow: ElectronBrowserWindow): void {
  try {
    browserWindow.blur?.();
  } catch {
    // не критично
  }
}
