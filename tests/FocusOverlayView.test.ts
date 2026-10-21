import { afterEach, describe, expect, it, vi } from "vitest";
import type { WorkspaceLeaf } from "obsidian";
import type TasksForFocusPlugin from "../src/main";
import type { ListBranch } from "../src/core/taskTree";

import { FocusOverlayView } from "../src/overlay/FocusOverlayView";

type ViewInternals = {
  openStripLineNo: number | null;
  editingLineNo: number | null;
  pendingRender: boolean;
  render: () => Promise<void>;
  renderFoldButton: (row: HTMLElement, branch: ListBranch, folds: Set<string>) => void;
};

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("fold interaction lifecycle", () => {
  it("keeps later setting refreshes working after folding with an open emoji picker", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", { setTimeout, clearTimeout });
    const view = new FocusOverlayView({} as WorkspaceLeaf, {} as TasksForFocusPlugin);
    const internal = view as unknown as ViewInternals;
    const render = vi.fn(async () => undefined);
    internal.render = render;
    internal.openStripLineNo = 1;
    let click = () => {};
    const button = {
      addClass() {}, setAttribute() {},
      addEventListener(_event: string, callback: () => void) { click = callback; },
    };
    const row = { createEl: () => button, addClass() {}, insertBefore() {} };
    internal.renderFoldButton(row as unknown as HTMLElement,
      { lineNo: 0, end: 3, indent: 0, title: "Parent", key: "parent", hasChildren: true }, new Set());
    click();
    await vi.advanceTimersByTimeAsync(350);
    render.mockClear();
    view.requestRender();
    await vi.advanceTimersByTimeAsync(350);
    expect(render).toHaveBeenCalledOnce();
    expect(internal.openStripLineNo).toBeNull();
    expect(internal.pendingRender).toBe(false);
  });
});
