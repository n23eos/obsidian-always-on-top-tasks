// Единая точка для уведомлений: имя плагина подставляется здесь, а сами
// сообщения остаются в sentence case, как требует гайдлайн Obsidian.

import { Notice } from "obsidian";

const PLUGIN_NAME = "Always-on-Top Tasks";

export function notify(message: string, timeoutMs?: number): void {
  new Notice(`${PLUGIN_NAME}: ${message}`, timeoutMs);
}
