import { apiVersion } from "obsidian";
import type TasksForFocusPlugin from "../main";
import { getBrowserWindowFor } from "../electron";
import { FOCUS_OVERLAY_VIEW_TYPE } from "../overlay/FocusOverlayView";
import { notify } from "../notify";
import { QuitBridge, type QuitGuardApi, type QuitIpc } from "./QuitBridge";
import { prepareQuitState } from "./prepareQuit";

import quitGuardSource from "tfa:quit-guard-source";

interface RemoteLoader {
  require(id: string): unknown;
}
interface MainVm {
  runInNewContext(source: string, context: Record<string, unknown>): QuitGuardApi | null;
}

/** Narrow compatibility shim for the reproduced native popout shutdown bug. */
export function installQuitWorkaround(
  plugin: TasksForFocusPlugin,
  checkpoint: () => Promise<void>,
): { dispose(): void; syncWindow(): void } | null {
  if (process.platform !== "darwin" || apiVersion !== "1.13.7"
    || process.versions.electron !== "39.8.3") return null;
  let guard: QuitGuardApi | null = null;
  let bridge: QuitBridge | null = null;
  try {
    const nativeWindow = getBrowserWindowFor(window);
    if (!nativeWindow) return null;
    // Whole remote module objects preserve native identity across IPC. Passing
    // callbacks would keep them in this renderer, which disappears during quit.
    const load = (window as Window & { require?: (name: string) => unknown }).require;
    if (!load) return null;
    const remote = load("@electron/remote") as RemoteLoader;
    const ipc = (load("electron") as { ipcRenderer: QuitIpc }).ipcRenderer;
    const vm = remote.require("vm") as MainVm;
    const channel = `tasks-for-focus-adhd:prepare-quit:${nativeWindow.id}`;
    guard = vm.runInNewContext(quitGuardSource, {
      module: { exports: {} },
      electron: remote.require("electron"),
      timers: remote.require("timers"),
      options: { ownerId: nativeWindow.id, overlayId: null, prepareChannel: channel },
    });
    if (!guard) return null;
    bridge = new QuitBridge(guard, ipc, channel,
      (current) => prepareQuitState(plugin.focusSessions, plugin.timers, checkpoint, current),
      (error) => {
        console.error("Always-on-Top Tasks: quit preparation failed", error);
        notify("could not save the focus state. Obsidian was left open. Please retry quitting after saving is available.", 15000);
      });
    const syncWindow = () => {
      const leaves = plugin.app.workspace.getLeavesOfType(FOCUS_OVERLAY_VIEW_TYPE);
      const host = leaves.length === 1 ? leaves[0].view.containerEl.win : null;
      const id = host && host !== window ? getBrowserWindowFor(host)?.id ?? null : null;
      guard?.setOverlay(id);
    };
    plugin.registerEvent(plugin.app.workspace.on("layout-change", syncWindow));
    plugin.app.workspace.onLayoutReady(syncWindow);
    const installedBridge = bridge;
    return { dispose: () => installedBridge.dispose(), syncWindow };
  } catch (error) {
    try {
      if (bridge) bridge.dispose();
      else guard?.release();
    } catch { /* Native startup may have failed before the handle became usable. */ }
    console.warn("Always-on-Top Tasks: safe quit workaround unavailable", error);
    return null;
  }
}
