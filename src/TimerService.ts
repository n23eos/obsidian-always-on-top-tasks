// Единственный бегущий таймер: старт/стоп, запись в файл, восстановление
// после перезапуска Obsidian (startedAt хранится в data.json).

import type { TAbstractFile, TFile } from "obsidian";
import { notify } from "./notify";
import type TasksForFocusPlugin from "./main";
import { commitSession, type CommitResult, type RunningTimer } from "./core/timer";
import { addBreakTime } from "./core/breakLine";
import { formatDuration } from "./core/taskLine";

function isTFile(file: TAbstractFile | null): file is TFile {
  return file !== null && "extension" in file;
}

export class TimerService {
  /** Начало перерыва (epoch ms). Не персистится: рестарт Obsidian = перерыв забыт. */
  breakStartedAt: number | null = null;
  /** Заметка, в которую запишется суммарное время перерывов. */
  private breakFilePath: string | null = null;
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly plugin: TasksForFocusPlugin) {}

  /** Перерыв: коммитит бегущий таймер задачи и запускает секундомер отдыха. */
  async startBreak(filePath: string): Promise<void> {
    return this.serialize(async () => this.startBreakNow(filePath));
  }

  private async startBreakNow(filePath: string): Promise<void> {
    await this.stopNow();
    if (this.running) return;
    this.breakStartedAt = Date.now();
    this.breakFilePath = filePath;
  }

  /** Конец перерыва: время добавляется к строке "☕ Ч:ММ:СС" в заметке. */
  async endBreak(): Promise<void> {
    return this.serialize(async () => this.endBreakNow());
  }

  private async endBreakNow(): Promise<void> {
    const startedAt = this.breakStartedAt;
    const filePath = this.breakFilePath;
    this.breakStartedAt = null;
    this.breakFilePath = null;
    if (startedAt === null || !filePath) return;

    const seconds = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    if (seconds === 0) return;

    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!isTFile(file)) return; // заметку удалили, перерыв некуда писать

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

  /** Бежит ли таймер на этой точной строке. */
  isRunningOn(filePath: string, lineText: string, lineNo: number): boolean {
    const timer = this.running;
    return (
      timer !== null &&
      timer.filePath === filePath &&
      timer.lineText === lineText &&
      timer.lineNo === lineNo
    );
  }

  /** Старт. Бегущий таймер (если есть) сначала останавливается и коммитится. */
  async start(filePath: string, lineNo: number, lineText: string): Promise<void> {
    return this.serialize(async () => this.startNow(filePath, lineNo, lineText));
  }

  private async startNow(filePath: string, lineNo: number, lineText: string): Promise<void> {
    await this.endBreakNow(); // работа началась, перерыв записан в заметку
    const running = this.running;
    const sameTarget =
      running !== null &&
      running.filePath === filePath &&
      running.lineNo === lineNo &&
      running.lineText === lineText;
    if (sameTarget && running.stoppedAt === undefined) return;

    let nextLineNo = lineNo;
    let nextLineText = lineText;
    if (running) {
      const stopped = await this.stopNow();
      if (sameTarget && stopped?.lineNo !== undefined && stopped.newLineText !== undefined) {
        nextLineNo = stopped.lineNo;
        nextLineText = stopped.newLineText;
      }
    }
    if (this.running) return;
    await this.setRunning({
      filePath,
      lineNo: nextLineNo,
      lineText: nextLineText,
      startedAt: Date.now(),
    });
  }

  /**
   * Стоп: пишет сессию в файл через vault.process (атомарно).
   * Время никогда не теряется молча: не нашли строку — Notice с длительностью.
   */
  async stop(): Promise<CommitResult | null> {
    return this.serialize(async () => this.stopNow());
  }

  private async stopNow(): Promise<CommitResult | null> {
    const running = this.running;
    if (!running) return null;

    const recovery = running.stoppedAt !== undefined;
    const timer: RunningTimer = running.stoppedAt === undefined
      ? { ...running, stoppedAt: Date.now() }
      : running;
    try {
      await this.setRunning(timer);
    } catch (error) {
      console.error("Always-on-Top Tasks: failed to persist stopped timer", error);
      notify(
        `could not preserve the stopped session for "${timer.lineText}". Retry save before starting another task.`,
        15000,
      );
      return null;
    }

    const file = this.plugin.app.vault.getAbstractFileByPath(timer.filePath);
    if (!isTFile(file)) {
      const lost = formatDuration(Math.floor(((timer.stoppedAt ?? timer.startedAt) - timer.startedAt) / 1000));
      notify(
        `file "${timer.filePath}" not found. The ${lost} session was not saved.`,
        10000,
      );
      return null;
    }

    let result: CommitResult | null = null;
    try {
      await this.plugin.app.vault.process(file, (content) => {
        result = commitSession(content, timer, Date.now(), recovery);
        return result.content ?? content;
      });
    } catch (error) {
      // Запись сорвалась (диск, права, sync-конфликт): время не теряем молча.
      console.error("Always-on-Top Tasks: failed to write timer session", error);
      const lost = formatDuration(Math.floor(((timer.stoppedAt ?? timer.startedAt) - timer.startedAt) / 1000));
      notify(
        `could not write the ${lost} session to "${timer.filePath}".\n` +
          `Retry save before starting another task: ${timer.lineText}`,
        15000,
      );
      result = null;
    }

    const completed = result as CommitResult | null;
    if (!completed) return null;
    this.notifyAbout(completed, timer);
    if (completed.kind !== "ok" && completed.kind !== "already-committed") return completed;
    const pendingTimer = completed.lineNo === undefined ? timer : { ...timer, lineNo: completed.lineNo };
    return await this.clearCommittedTimer(pendingTimer) ? completed : null;
  }

  private notifyAbout(result: CommitResult, timer: RunningTimer): void {
    const session = formatDuration(result.sessionSeconds);

    if (result.kind === "already-committed") return;

    if (result.kind === "not-found") {
      notify(
        `the task "${timer.lineText}" was changed or removed.\n` +
          `The ${session} session is preserved. Restore the task and retry save.`,
        15000,
      );
      return;
    }
    if (result.kind === "ambiguous") {
      notify(
        `the task location is ambiguous for "${timer.lineText}".\n` +
          `The ${session} session is preserved. Resolve the duplicate and retry save.`,
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

  private async clearCommittedTimer(pendingTimer: RunningTimer): Promise<boolean> {
    try {
      await this.setRunning(null);
      return true;
    } catch (error) {
      console.error("Always-on-Top Tasks: failed to clear committed timer", error);
    }

    try {
      await this.setRunning(null);
      return true;
    } catch (error) {
      console.error("Always-on-Top Tasks: failed to retry clearing committed timer", error);
      this.plugin.settings = { ...this.plugin.settings, runningTimer: pendingTimer };
      notify(
        "the session was saved, but its pending state could not be cleared. Retry save after settings storage recovers.",
        15000,
      );
      return false;
    }
  }

  private serialize<T>(operation: () => Promise<T>): Promise<T> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}
