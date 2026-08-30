// Единственный бегущий таймер: старт/стоп, запись в файл, восстановление
// после перезапуска Obsidian (startedAt хранится в data.json).

import { Notice, TFile } from "obsidian";
import type TasksForFocusPlugin from "./main";
import { commitSession, type CommitResult, type RunningTimer } from "./core/timer";
import { formatDuration } from "./core/taskLine";

export class TimerService {
  constructor(private readonly plugin: TasksForFocusPlugin) {}

  get running(): RunningTimer | null {
    return this.plugin.settings.runningTimer;
  }

  /** Бежит ли таймер на этой строке (текст надёжнее номера — строки сдвигаются). */
  isRunningOn(filePath: string, lineText: string): boolean {
    const timer = this.running;
    return timer !== null && timer.filePath === filePath && timer.lineText === lineText;
  }

  /** Старт. Бегущий таймер (если есть) сначала останавливается и коммитится. */
  async start(filePath: string, lineNo: number, lineText: string): Promise<void> {
    if (this.running) await this.stop();
    await this.setRunning({ filePath, lineNo, lineText, startedAt: Date.now() });
  }

  /**
   * Стоп: пишет сессию в файл через vault.process (атомарно).
   * Время никогда не теряется молча: не нашли строку — Notice с длительностью.
   */
  async stop(): Promise<CommitResult | null> {
    const timer = this.running;
    if (!timer) return null;

    const file = this.plugin.app.vault.getAbstractFileByPath(timer.filePath);
    if (!(file instanceof TFile)) {
      const lost = formatDuration(Math.floor((Date.now() - timer.startedAt) / 1000));
      new Notice(`Tasks for Focus: файл «${timer.filePath}» не найден. Сессия ${lost} не записана.`, 10000);
      await this.setRunning(null);
      return null;
    }

    let result: CommitResult | null = null;
    try {
      await this.plugin.app.vault.process(file, (content) => {
        result = commitSession(content, timer, Date.now());
        return result.content ?? content;
      });
    } catch (error) {
      // Запись сорвалась (диск, права, sync-конфликт): время не теряем молча.
      console.error("Tasks for Focus: failed to write timer session", error);
      const lost = formatDuration(Math.floor((Date.now() - timer.startedAt) / 1000));
      new Notice(
        `Tasks for Focus: не удалось записать сессию ${lost} в «${timer.filePath}».\n` +
          `Добавь вручную к задаче: ${timer.lineText}`,
        15000,
      );
      result = null;
    } finally {
      await this.setRunning(null); // таймер не должен зависнуть навсегда
    }

    if (!result) return null;
    this.notifyAbout(result, timer);
    return result;
  }

  private notifyAbout(result: CommitResult, timer: RunningTimer): void {
    const session = formatDuration(result.sessionSeconds);

    if (result.kind === "not-found") {
      new Notice(
        `Tasks for Focus: задача «${timer.lineText}» изменилась или удалена.\n` +
          `Сессия ${session} не записана — добавь вручную.`,
        15000,
      );
      return;
    }
    if (result.kind === "ambiguous") {
      new Notice(
        `Tasks for Focus: несколько одинаковых строк «${timer.lineText}».\n` +
          `Сессия ${session} не записана — добавь вручную.`,
        15000,
      );
      return;
    }
    if (result.isLongSession) {
      new Notice(`Tasks for Focus: записано ${session} — похоже, таймер был забыт. Проверь.`, 10000);
    }
  }

  private async setRunning(timer: RunningTimer | null): Promise<void> {
    this.plugin.settings = { ...this.plugin.settings, runningTimer: timer };
    await this.plugin.saveSettings();
  }
}
