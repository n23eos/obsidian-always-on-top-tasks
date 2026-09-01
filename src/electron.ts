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
  /** Край экрана; null = свободный режим (окно остаётся где стоит). */
  edge: OverlayEdge | null;
  width: number;
  opacity: number; // 0..1
  margin: number;
  /** Сохранённое положение для свободного режима. */
  freeBounds: ElectronRect | null;
  /** false = окно временно снято с "поверх всех" кнопкой в шапке. */
  pinned: boolean;
}

/** Пересекается ли прямоугольник с рабочей областью (окно не на отключённом мониторе). */
function intersects(a: ElectronRect, b: ElectronRect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

function dockedBounds(workArea: ElectronRect, geometry: OverlayGeometry, edge: OverlayEdge): ElectronRect {
  const x =
    edge === "right"
      ? workArea.x + workArea.width - geometry.width - geometry.margin
      : workArea.x + geometry.margin;
  return {
    x,
    y: workArea.y + geometry.margin,
    width: geometry.width,
    height: workArea.height - geometry.margin * 2,
  };
}

/**
 * Ставит окно по настройкам: к краю экрана или в сохранённое место, поверх
 * всех (включая полноэкранные приложения) и с прозрачностью. true = всё применилось.
 */
export function applyOverlayGeometry(
  browserWindow: ElectronBrowserWindow,
  hostWin: Window,
  geometry: OverlayGeometry,
): boolean {
  try {
    const remote = getRemoteFor(hostWin);
    const screen = remote?.screen;

    // Свободный режим без сохранённого места: окно остаётся там, где его
    // открыл Obsidian, — это и есть «не трогать».
    if (geometry.edge) {
      const workArea = screen?.getDisplayMatching(browserWindow.getBounds()).workArea;
      if (workArea) browserWindow.setBounds(dockedBounds(workArea, geometry, geometry.edge));
    } else if (geometry.freeBounds) {
      // Сохранённое место может быть на отключённом мониторе — тогда правый край.
      const workArea = screen?.getDisplayMatching(geometry.freeBounds).workArea;
      const isVisible = workArea ? intersects(geometry.freeBounds, workArea) : true;
      if (isVisible) browserWindow.setBounds(geometry.freeBounds);
      else if (workArea) browserWindow.setBounds(dockedBounds(workArea, geometry, "right"));
    }

    setPinned(browserWindow, geometry.pinned);
    browserWindow.setOpacity?.(geometry.opacity);
    return true;
  } catch (error) {
    console.error("Always-on-Top Tasks: failed to apply overlay geometry", error);
    return false;
  }
}

/** Поверх всех окон (включая полноэкранные, уровень 'screen-saver' на macOS) или обычное окно. */
export function setPinned(browserWindow: ElectronBrowserWindow, pinned: boolean): void {
  try {
    if (pinned) {
      browserWindow.setAlwaysOnTop(true, "screen-saver");
      browserWindow.setVisibleOnAllWorkspaces?.(true, { visibleOnFullScreen: true });
    } else {
      browserWindow.setAlwaysOnTop(false);
      browserWindow.setVisibleOnAllWorkspaces?.(false);
    }
  } catch {
    // окно уже закрыто или API недоступен — плагин живёт без пина
  }
}

/** Текущее положение окна; null, если окно закрыто или API недоступен. */
export function readBounds(browserWindow: ElectronBrowserWindow): ElectronRect | null {
  try {
    if (browserWindow.isDestroyed?.()) return null;
    return browserWindow.getBounds();
  } catch {
    return null;
  }
}

export function sameRect(a: ElectronRect | null, b: ElectronRect | null): boolean {
  if (!a || !b) return a === b;
  return a.x === b.x && a.y === b.y && a.width === b.width && a.height === b.height;
}

/** Снимает always-on-top (при закрытии overlay / выгрузке плагина). */
export function releaseWindow(browserWindow: ElectronBrowserWindow): void {
  try {
    if (browserWindow.isDestroyed?.()) return;
    setPinned(browserWindow, false);
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
