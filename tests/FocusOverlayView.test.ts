import { afterEach, describe, expect, it, vi } from "vitest";
import { TFile, type WorkspaceLeaf } from "obsidian";
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


describe("overlay privacy", () => {
  function setup() {
    const file = Object.assign(new TFile(), { path: "Private.md", basename: "Private" });
    const read = vi.fn(async () => "- [ ] Secret");
    const save = vi.fn();
    const plugin = {
      settings: { focusSessionsEnabled: false },
      app: { vault: { read, getAbstractFileByPath: () => file }, workspace: { requestSaveLayout: save } },
      overlay: { close: vi.fn() },
    } as unknown as TasksForFocusPlugin;
    const view = new FocusOverlayView({} as WorkspaceLeaf, plugin);
    let placeholder = false;
    const node = () => ({
      createDiv: (options?: { cls?: string }) => {
        if (options?.cls === "tfa-private") placeholder = true;
        return node();
      },
      createEl: () => node(), createSpan: () => node(),
      addEventListener: vi.fn(), focus: vi.fn(),
    });
    const empty = vi.fn(() => { placeholder = false; });
    Object.assign(view, { contentEl: {
      ...node(), empty, classList: { toggle: vi.fn() },
      querySelector: () => placeholder ? {} : null,
    } });
    return { view, file, read, save, empty };
  }

  it("hides synchronously despite an open editor and saves safe workspace state", () => {
    const { view, file, save, empty } = setup();
    Object.assign(view, { file, editingLineNo: 0, openStripLineNo: 0 });
    view.setContentHidden(true);
    expect(empty).toHaveBeenCalledOnce();
    expect(view.getDisplayText()).toBe("Focus");
    expect(view.getState()).toEqual({ filePath: "Private.md", privacyHidden: true });
    expect(save).toHaveBeenCalledOnce();
    expect((view as unknown as ViewInternals).editingLineNo).toBeNull();
  });

  it("invalidates a pending read and never rereads note content while hidden", async () => {
    const { view, file, read, empty } = setup();
    let resolve!: (value: string) => void;
    read.mockImplementationOnce(() => new Promise<string>((done) => { resolve = done; }));
    Object.assign(view, { file });
    const internal = view as unknown as ViewInternals;
    const rendering = internal.render();
    expect(read).toHaveBeenCalledOnce();
    view.setContentHidden(true);
    resolve("- [ ] Secret");
    await rendering;
    await internal.render();
    expect(empty).toHaveBeenCalledOnce();
    expect(read).toHaveBeenCalledOnce();
    expect(view.isContentHidden).toBe(true);
  });

  it("does not trust placeholder classes supplied by note HTML", () => {
    const { view, file, empty } = setup();
    Object.assign(view, { file });
    Object.assign(view.contentEl, { querySelector: () => ({ className: "tfa-private" }) });
    view.setContentHidden(true);
    expect(empty).toHaveBeenCalledOnce();
  });

  it("restores hidden state before attempting to read the note", async () => {
    const { view, read } = setup();
    await view.setState({ filePath: "Private.md", privacyHidden: true }, { history: false });
    expect(view.isContentHidden).toBe(true);
    expect(read).not.toHaveBeenCalled();
    expect(view.getDisplayText()).toBe("Focus");
  });

  it("clears the popout document title without touching the main window title", () => {
    const { view, file } = setup();
    const mainWindow = { document: { title: "Main note" } };
    vi.stubGlobal("window", mainWindow);
    const host = { document: { title: "Private note" } };
    Object.assign(view, { file });
    Object.assign(view.contentEl, { ownerDocument: { defaultView: host } });
    view.setContentHidden(true);
    expect(host.document.title).toBe("Focus");
    expect(mainWindow.document.title).toBe("Main note");
  });

  it("reveals explicitly and clears privacy in saved state", () => {
    const { view, file } = setup();
    Object.assign(view, { file });
    view.setContentHidden(true);
    (view as unknown as ViewInternals).render = vi.fn(async () => undefined);
    view.setContentHidden(false);
    expect(view.isContentHidden).toBe(false);
    expect(view.getDisplayText()).toBe("Private");
    expect(view.getState().privacyHidden).toBe(false);
  });
});
