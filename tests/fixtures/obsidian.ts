// Minimal host adapter for view lifecycle tests; no DOM rendering is simulated.
export class ItemView {
  contentEl = { querySelectorAll: () => [] };
  async setState(): Promise<void> {}
}
export class TFile {}
export class WorkspaceLeaf {}
export class Notice {}
export const MarkdownRenderer = {};
export function setIcon(): void {}
export class App {}
export class PluginSettingTab { update(): void {} }
export class Setting {}
export const normalizePath = (path: string): string => path;
export const requireApiVersion = (): boolean => true;
