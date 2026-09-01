// Подсказки путей к markdown-файлам для поля "Note to pin" в Obsidian < 1.13
// (там ещё нет декларативного file-контрола).

import { AbstractInputSuggest, App, TFile } from "obsidian";

const MAX_SUGGESTIONS = 50;

export class FileSuggest extends AbstractInputSuggest<TFile> {
  constructor(
    app: App,
    private readonly inputEl: HTMLInputElement,
    private readonly onPick: (file: TFile) => void,
  ) {
    super(app, inputEl);
  }

  protected getSuggestions(query: string): TFile[] {
    const needle = query.toLowerCase();
    return this.app.vault
      .getMarkdownFiles()
      .filter((file) => file.path.toLowerCase().includes(needle))
      .slice(0, MAX_SUGGESTIONS);
  }

  renderSuggestion(file: TFile, el: HTMLElement): void {
    el.setText(file.path);
  }

  selectSuggestion(file: TFile): void {
    this.inputEl.value = file.path;
    this.onPick(file);
    this.close();
  }
}
