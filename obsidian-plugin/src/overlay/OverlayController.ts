// Открытие/закрытие overlay-окна: popout leaf + always-on-top + геометрия.

import { Notice, TFile, WorkspaceLeaf } from "obsidian";
import { FOCUS_OVERLAY_VIEW_TYPE } from "./FocusOverlayView";
import type TasksForFocusPlugin from "../main";
import {
  applyOverlayGeometry,
  blurWindow,
  getBrowserWindowFor,
  releaseWindow,
  type ElectronBrowserWindow,
} from "../electron";
import { OVERLAY_MARGIN } from "../settings";

// BrowserWindow появляется не мгновенно после openPopoutLeaf — ретраим.
const PIN_MAX_ATTEMPTS = 10;
const PIN_RETRY_DELAY_MS = 75;

export class OverlayController {
  private leaf: WorkspaceLeaf | null = null;
  private browserWindow: ElectronBrowserWindow | null = null;

  constructor(private readonly plugin: TasksForFocusPlugin) {
    // Если popout закрыли крестиком окна — забываем его. Регистрируем один раз.
    this.plugin.app.workspace.onLayoutReady(() => {
      this.plugin.registerEvent(
        this.plugin.app.workspace.on("layout-change", () => {
          if (this.leaf && !this.leaf.view.containerEl.isConnected) {
            this.forget();
          }
        }),
      );
    });
  }

  get isOpen(): boolean {
    return this.leaf !== null;
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

    await leaf.setViewState({
      type: FOCUS_OVERLAY_VIEW_TYPE,
      state: { filePath: file.path },
    });

    await this.pinWithRetry(leaf);
  }

  private async pinWithRetry(leaf: WorkspaceLeaf): Promise<void> {
    for (let attempt = 0; attempt < PIN_MAX_ATTEMPTS; attempt++) {
      const hostWin = leaf.view.containerEl.win;
      if (hostWin && hostWin !== window) {
        const browserWindow = getBrowserWindowFor(hostWin);
        if (browserWindow) {
          this.browserWindow = browserWindow;
          this.applyGeometry();
          return;
        }
      }
      await sleep(PIN_RETRY_DELAY_MS);
    }
    new Notice(
      "Tasks for Focus: окно открыто, но закрепить поверх не удалось (Electron API недоступен).",
    );
  }

  /** Применяет край/ширину/прозрачность и экспериментальные флаги из настроек. */
  applyGeometry(): void {
    if (!this.browserWindow) return;
    const hostWin = this.leaf?.view.containerEl.win;
    if (!hostWin) return;

    const { edge, overlayWidth, opacity, clickThrough, nonFocusable } = this.plugin.settings;
    applyOverlayGeometry(this.browserWindow, hostWin, {
      edge,
      width: overlayWidth,
      opacity,
      margin: OVERLAY_MARGIN,
    });
    try {
      this.browserWindow.setIgnoreMouseEvents?.(clickThrough);
      this.browserWindow.setFocusable?.(!nonFocusable);
      this.browserWindow.setSkipTaskbar?.(true);
    } catch {
      // экспериментальные флаги не критичны
    }
  }

  /** Увести фокус с overlay после клика по кнопке. */
  blur(): void {
    if (this.browserWindow) blurWindow(this.browserWindow);
  }

  close(): void {
    if (this.browserWindow) releaseWindow(this.browserWindow);
    this.leaf?.detach();
    this.forget();
  }

  private forget(): void {
    this.leaf = null;
    this.browserWindow = null;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
