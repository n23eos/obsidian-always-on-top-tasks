// Открытие/закрытие overlay-окна: popout leaf + always-on-top + геометрия.

import { TFile, WorkspaceLeaf } from "obsidian";
import { FOCUS_OVERLAY_VIEW_TYPE } from "./FocusOverlayView";
import type TasksForFocusPlugin from "../main";
import {
  applyOverlayGeometry,
  blurWindow,
  getBrowserWindowFor,
  readBounds,
  releaseWindow,
  sameRect,
  setPinned,
  type ElectronBrowserWindow,
} from "../electron";
import { OVERLAY_MARGIN } from "../settings";
import { notify } from "../notify";

// BrowserWindow появляется не мгновенно после openPopoutLeaf — ретраим.
const PIN_MAX_ATTEMPTS = 10;
const PIN_RETRY_DELAY_MS = 75;
/** Как часто запоминать положение окна в свободном режиме. */
const REMEMBER_BOUNDS_INTERVAL_MS = 2000;

export class OverlayController {
  private leaf: WorkspaceLeaf | null = null;
  private browserWindow: ElectronBrowserWindow | null = null;
  private readonly detachedLeaves = new WeakSet<WorkspaceLeaf>();
  private pinGeneration = 0;
  /** Поверх всех окон. Кнопка в шапке снимает пин временно, до закрытия. */
  private pinned = true;

  constructor(private readonly plugin: TasksForFocusPlugin) {
    this.plugin.app.workspace.onLayoutReady(() => {
      this.adoptRestoredLeaf();

      // Если popout закрыли крестиком окна — забываем его. Регистрируем один раз.
      this.plugin.registerEvent(
        this.plugin.app.workspace.on("layout-change", () => {
          if (this.leaf && !this.leaf.view.containerEl.isConnected) {
            this.forget();
          }
          this.adoptRestoredLeaf();
        }),
      );
      this.plugin.registerInterval(
        window.setInterval(() => this.rememberBounds(), REMEMBER_BOUNDS_INTERVAL_MS),
      );
    });
  }

  get isOpen(): boolean {
    return this.leaf !== null;
  }

  get isPinned(): boolean {
    return this.pinned;
  }

  private adoptRestoredLeaf(): void {
    if (this.leaf) return;
    const restoredLeaf = this.plugin.app.workspace
      .getLeavesOfType(FOCUS_OVERLAY_VIEW_TYPE)
      .find((leaf) =>
        leaf.view.containerEl.isConnected && !this.detachedLeaves.has(leaf));
    if (!restoredLeaf) return;
    this.leaf = restoredLeaf;
    this.pinned = true;
    void this.pinWithRetry(restoredLeaf);
  }

  /** Повторный вызов закрывает overlay (toggle), guard от второго экземпляра. */
  async toggle(file: TFile): Promise<void> {
    if (this.leaf) {
      this.close();
      return;
    }
    await this.open(file);
  }

  private async open(file: TFile): Promise<void> {
    const leaf = this.plugin.app.workspace.openPopoutLeaf();
    this.leaf = leaf;
    this.pinned = true;

    await leaf.setViewState({
      type: FOCUS_OVERLAY_VIEW_TYPE,
      state: { filePath: file.path },
    });

    await this.pinWithRetry(leaf);
  }

  private async pinWithRetry(leaf: WorkspaceLeaf): Promise<void> {
    const generation = ++this.pinGeneration;
    for (let attempt = 0; attempt < PIN_MAX_ATTEMPTS; attempt++) {
      if (this.leaf !== leaf || this.pinGeneration !== generation) return;
      const hostWin = leaf.view.containerEl.win;
      if (hostWin && hostWin !== window) {
        const browserWindow = getBrowserWindowFor(hostWin);
        if (browserWindow) {
          if (this.leaf !== leaf || this.pinGeneration !== generation) return;
          this.browserWindow = browserWindow;
          this.applyGeometry();
          this.plugin.syncQuitWorkaround?.();
          return;
        }
      }
      await sleep(PIN_RETRY_DELAY_MS);
    }
    if (this.leaf !== leaf || this.pinGeneration !== generation) return;
    notify("the window opened, but could not be pinned on top (the Electron API is unavailable).");
  }

  /** Применяет режим стыковки/ширину/прозрачность и экспериментальные флаги из настроек. */
  applyGeometry(): void {
    if (!this.browserWindow) return;
    const hostWin = this.leaf?.view.containerEl.win;
    if (!hostWin) return;

    const { dockMode, overlayWidth, opacity, clickThrough, nonFocusable, freeBounds } =
      this.plugin.settings;
    applyOverlayGeometry(this.browserWindow, hostWin, {
      edge: dockMode === "free" ? null : dockMode,
      width: overlayWidth,
      opacity,
      margin: OVERLAY_MARGIN,
      freeBounds,
      pinned: this.pinned,
    });
    try {
      this.browserWindow.setIgnoreMouseEvents?.(clickThrough);
      this.browserWindow.setFocusable?.(!nonFocusable);
      this.browserWindow.setSkipTaskbar?.(true);
    } catch {
      // экспериментальные флаги не критичны
    }
  }

  /** Временно снять/вернуть "поверх всех". Возвращает новое состояние. */
  togglePin(): boolean {
    this.pinned = !this.pinned;
    if (this.browserWindow) setPinned(this.browserWindow, this.pinned);
    return this.pinned;
  }

  /** Свободный режим: положение окна сохраняется, когда пользователь его двигает. */
  rememberBounds(): void {
    if (this.plugin.settings.dockMode !== "free" || !this.browserWindow) return;
    const bounds = readBounds(this.browserWindow);
    if (!bounds || sameRect(bounds, this.plugin.settings.freeBounds)) return;
    void this.plugin.patchSettings({ freeBounds: bounds });
  }

  /** Увести фокус с overlay после клика по кнопке. */
  blur(): void {
    if (this.browserWindow) blurWindow(this.browserWindow);
  }

  /** Закрытие по команде пользователя: снять пин и убрать окно. */
  close(): void {
    this.rememberBounds();
    this.release();
    const leaf = this.leaf;
    if (leaf) this.detachedLeaves.add(leaf);
    leaf?.detach();
    this.forget();
  }

  /**
   * Снять always-on-top/прозрачность, не трогая раскладку. Используется при
   * выгрузке плагина: гайдлайн Obsidian запрещает detach() в onunload, поэтому
   * окно остаётся обычным popout — пользователь закроет его сам.
   */
  release(): void {
    this.pinGeneration += 1;
    if (this.browserWindow) releaseWindow(this.browserWindow);
  }

  private forget(): void {
    this.leaf = null;
    this.browserWindow = null;
    this.pinned = true;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}
