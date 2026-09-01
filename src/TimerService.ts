// Единственный бегущий таймер: старт/стоп, запись в файл, восстановление
// после перезапуска Obsidian (startedAt хранится в data.json).

import { TFile } from "obsidian";
import { notify } from "./notify";
import type TasksForFocusPlugin from "./main";
import { commitSession, type CommitResult, type RunningTimer } from "./core/timer";
import { addBreakTime } from "./core/breakLine";
import { formatDuration } from "./core/taskLine";

export class TimerService {
  /** Начало перерыва (epoch ms). Не персистится: рестарт Obsidian = перерыв забыт. */
  breakStartedAt: number | null = null;
  /** Заметка, в которую запишется суммарное время перерывов. */
  private breakFilePath: string | null = null;

  constructor(private readonly plugin: TasksForFocusPlugin) {}

  /** Перерыв: коммитит бегущий таймер задачи и запускает секундомер отдыха. */
  async startBreak(filePath: string): Promise<void> {
    await this.stop();
    this.breakStartedAt = Date.now();
    this.breakFilePath = filePath;
  }

  /** Конец перерыва: время добавляется к строке "☕ Ч:ММ:СС" в заметке. */
  async endBreak(): Promise<void> {
    const startedAt = this.breakStartedAt;
    const filePath = this.breakFilePath;
    this.breakStartedAt = null;
    this.breakFilePath = null;
    if (startedAt === null || !filePath) return;

    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    if (seconds === 0) return;

    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!(file instanceof TFile)) return; // заметку удалили — перерыв некуда писать

    try {
      await this.plugin.app.vault.process(file, (content) => addBreakTime(content, seconds));
    } catch (error) {
      console.error("Always-on-Top Tasks: failed to write break time", error);
      notify(
        `could not save the ${formatDuration(seconds)} break. ` +
          "Add it to the ☕ line by hand.",
        10000,
      );
    }
  }

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
    await this.endBreak(); // работа началась — перерыв записан в заметку
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
      notify(
        `file "${timer.filePath}" not found. The ${lost} session was not saved.`,
        10000,
      );
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
      console.error("Always-on-Top Tasks: failed to write timer session", error);
      const lost = formatDuration(Math.floor((Date.now() - timer.startedAt) / 1000));
      notify(
        `could not write the ${lost} session to "${timer.filePath}".\n` +
          `Add it to this task by hand: ${timer.lineText}`,
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
      notify(
        `the task "${timer.lineText}" was changed or removed.\n` +
          `The ${session} session was not saved — add it by hand.`,
        15000,
      );
      return;
    }
    if (result.kind === "ambiguous") {
      notify(
        `several identical lines "${timer.lineText}".\n` +
          `The ${session} session was not saved — add it by hand.`,
        15000,
      );
      return;
    }
    if (result.isLongSession) {
      notify(
        `saved ${session} — looks like the timer was left running. Check it.`,
        10000,
      );
    }
  }

  private async setRunning(timer: RunningTimer | null): Promise<void> {
    await this.plugin.patchSettings({ runningTimer: timer });
  }
}
