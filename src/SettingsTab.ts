// Вкладка настроек. Один список определений (settings/definitions.ts):
// Obsidian 1.13+ берёт его через getSettingDefinitions() и делает настройки
// искомыми; старые версии зовут display(), где тот же список рисует адаптер.
// Изменения применяются к открытому overlay сразу.

import {
  App,
  PluginSettingTab,
  Setting,
  normalizePath,
  requireApiVersion,
  type SettingDefinition,
  type SettingDefinitionItem,
} from "obsidian";
import type TasksForFocusPlugin from "./main";
import { resetToDefaults } from "./settings";
import { buildSettingDefinitions, VISIBILITY_KEYS, type SettingKey } from "./SettingDefinitions";
import { FileSuggest } from "./FileSuggest";

function isShown(visible: boolean | (() => boolean) | undefined): boolean {
  return typeof visible === "function" ? visible() : visible !== false;
}

export class TasksForFocusSettingsTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: TasksForFocusPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem[] {
    return buildSettingDefinitions({
      settings: () => this.plugin.settings,
      resetToDefaults: () => void this.reset(),
    });
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as SettingKey];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    const normalized = key === "focusNotePath" ? normalizeNotePath(value) : value;
    await this.plugin.updateSettings({ [key]: normalized });
    if (VISIBILITY_KEYS.includes(key as SettingKey)) this.refresh();
  }

  private async reset(): Promise<void> {
    await this.plugin.updateSettings(resetToDefaults(this.plugin.settings));
    this.refresh();
  }

  /** Перерисовать вкладку: в 1.13+ её рисует Obsidian, старым версиям — адаптер. */
  private refresh(): void {
    if (requireApiVersion("1.13.0")) this.update();
    else this.renderLegacy();
  }

  // ---------- адаптер для Obsidian < 1.13 ----------

  /** Obsidian < 1.13 зовёт display(); в 1.13+ он не вызывается, пока есть определения. */
  display(): void {
    this.renderLegacy();
  }

  private renderLegacy(): void {
    const { containerEl } = this;
    containerEl.empty();
    for (const item of this.getSettingDefinitions()) this.renderItem(containerEl, item);
  }

  private renderItem(containerEl: HTMLElement, item: SettingDefinitionItem): void {
    if ("type" in item) {
      // Группа с заголовком; вложенные страницы и списки плагин не использует.
      if ((item.type !== "group" && item.type !== "list") || !isShown(item.visible)) return;
      if (item.heading) new Setting(containerEl).setName(item.heading).setHeading();
      for (const child of item.items ?? []) {
        if (!("type" in child)) this.renderDefinition(containerEl, child);
      }
      return;
    }
    this.renderDefinition(containerEl, item);
  }

  private renderDefinition(containerEl: HTMLElement, def: SettingDefinition): void {
    if (!isShown(def.visible)) return;
    const setting = new Setting(containerEl).setName(def.name);
    if (def.desc) setting.setDesc(def.desc);

    if (def.action) {
      const action = def.action;
      setting.addButton((button) =>
        button.setButtonText(def.name).onClick(() => action(setting.settingEl, 0)),
      );
      return;
    }
    if (!def.control) return;

    const control = def.control;
    const value = this.getControlValue(control.key);
    const set = (next: unknown) => void this.setControlValue(control.key, next);

    switch (control.type) {
      case "toggle":
        setting.addToggle((toggle) => toggle.setValue(Boolean(value)).onChange(set));
        return;
      case "dropdown":
        setting.addDropdown((dropdown) =>
          dropdown.addOptions(control.options).setValue(String(value)).onChange(set),
        );
        return;
      case "slider": {
        // Значение рядом со слайдером: старые версии сами его не показывают.
        const format = control.displayFormat ?? ((n: number) => String(n));
        const valueEl = setting.controlEl.createSpan({
          cls: "tfa-slider-value",
          text: format(Number(value)),
        });
        setting.addSlider((slider) =>
          slider
            .setLimits(control.min, control.max, control.step)
            .setValue(Number(value))
            .onChange((next) => {
              valueEl.setText(format(next));
              set(next);
            }),
        );
        return;
      }
      case "text":
        setting.addText((text) =>
          text.setPlaceholder(control.placeholder ?? "").setValue(String(value)).onChange(set),
        );
        return;
      case "file":
        setting.addSearch((search) => {
          search.setPlaceholder(control.placeholder ?? "").setValue(String(value)).onChange(set);
          new FileSuggest(this.app, search.inputEl, (file) => set(file.path));
        });
        return;
      default:
        return; // остальные типы контролов плагин не использует
    }
  }
}

function normalizeNotePath(value: unknown): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed ? normalizePath(trimmed) : "";
}
