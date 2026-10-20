// Единственный бегущий таймер: старт/стоп, запись в файл, восстановление
// после перезапуска Obsidian (startedAt хранится в data.json).

import type { TAbstractFile, TFile } from "obsidian";
import { notify } from "./notify";
import type TasksForFocusPlugin from "./main";
import { commitSession, type CommitResult, type RunningTimer } from "./core/timer";
import {
  commitBreakTime,
  prepareBreakCommit,
  type BreakCommitResult,
  type PersistedBreak,
} from "./core/breakLine";
import { formatDuration, parseTaskLine } from "./core/taskLine";

function isTFile(file: TAbstractFile | null): file is TFile {
  return file !== null && "extension" in file;
}

export class TimerService {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly plugin: TasksForFocusPlugin) {}

  get breakStartedAt(): number | null {
    return this.breakTimer?.startedAt ?? null;
  }

  get breakStoppedAt(): number | null {
    return this.breakTimer?.stoppedAt ?? null;
  }

  /** Перерыв: коммитит бегущий таймер задачи и запускает секундомер отдыха. */
  async startBreak(filePath: string): Promise<void> {
    return this.serialize(async () => this.startBreakNow(filePath));
  }

  private async startBreakNow(filePath: string): Promise<void> {
    await this.stopNow();
    if (this.running || this.breakStartedAt !== null) return;
    await this.setBreak({ filePath, startedAt: Date.now() });
  }

  /** Конец перерыва: время добавляется к строке "☕ Ч:ММ:СС" в заметке. */
  async endBreak(): Promise<void> {
    await this.serialize(async () => this.endBreakNow());
  }

  private async endBreakNow(): Promise<boolean> {
    const active = this.breakTimer;
    if (!active) return true;

    let pending: PersistedBreak = active.stoppedAt === undefined
      ? { ...active, stoppedAt: Date.now() }
      : active;
    if (active.stoppedAt === undefined) {
      try {
        await this.setBreak(pending);
      } catch (error) {
        console.error("Always-on-Top Tasks: failed to persist stopped break", error);
        notify("could not preserve the stopped break. Retry before starting another task.", 15000);
        return false;
      }
    }

    const stoppedAt = pending.stoppedAt ?? pending.startedAt;
    const seconds = Math.max(0, Math.floor((stoppedAt - pending.startedAt) / 1000));
    if (seconds === 0) {
      return this.clearCommittedBreak(pending);
    }

    const file = this.plugin.app.vault.getAbstractFileByPath(pending.filePath);
    if (!isTFile(file)) {
      notify(
        `file "${pending.filePath}" not found. The ${formatDuration(seconds)} break is preserved; restore or rename the note and retry save.`,
        15000,
      );
      return false;
    }

    if (!pending.commit) {
      let prepared: PersistedBreak["commit"] | null = null;
      try {
        await this.plugin.app.vault.process(file, (content) => {
          prepared = prepareBreakCommit(content, seconds);
          return content;
        });
      } catch (error) {
        console.error("Always-on-Top Tasks: failed to inspect break total", error);
        notify(
          `could not prepare the ${formatDuration(seconds)} break save. It is preserved; retry after storage recovers.`,
          15000,
        );
        return false;
      }
      if (!prepared) {
        notify("the break total is ambiguous. Resolve duplicate coffee lines and retry save.", 15000);
        return false;
      }
      pending = { ...pending, commit: prepared };
    }

    try {
      await this.setBreak(pending);
    } catch (error) {
      console.error("Always-on-Top Tasks: failed to persist break recovery journal", error);
      notify("could not preserve break recovery state. Retry before starting another task.", 15000);
      return false;
    }

    let result: BreakCommitResult | null = null;
    try {
      await this.plugin.app.vault.process(file, (content) => {
        result = commitBreakTime(content, pending.commit!);
        return result.content;
      });
    } catch (error) {
      console.error("Always-on-Top Tasks: failed to write break time", error);
      notify(
        `could not save the ${formatDuration(seconds)} break. It is preserved; retry save after storage recovers.`,
        15000,
      );
      return false;
    }
    const completed = result as BreakCommitResult | null;
    if (!completed || completed.kind === "ambiguous") {
      notify(
        "the break total changed while recovery was pending. The save is ambiguous; restore the expected total and retry.",
        15000,
      );
      return false;
    }
    return this.clearCommittedBreak(pending);
  }

  /** Обновляет пути состояния после rename заметки или папки. */
  async renamePaths(oldPath: string, newPath: string, folder: boolean): Promise<void> {
    return this.serialize(async () => {
      const focusNotePath = renamedPath(
        this.plugin.settings.focusNotePath,
        oldPath,
        newPath,
        folder,
      );
      const running = this.running;
      const patch: {
        focusNotePath?: string;
        runningTimer?: RunningTimer;
        breakTimer?: PersistedBreak;
      } = {};
      if (focusNotePath !== this.plugin.settings.focusNotePath) {
        patch.focusNotePath = focusNotePath;
      }
      if (running) {
        const runningFilePath = renamedPath(running.filePath, oldPath, newPath, folder);
        if (runningFilePath !== running.filePath) {
          patch.runningTimer = { ...running, filePath: runningFilePath };
        }
      }
      const breakTimer = this.breakTimer;
      if (breakTimer) {
        const breakFilePath = renamedPath(breakTimer.filePath, oldPath, newPath, folder);
        if (breakFilePath !== breakTimer.filePath) {
          patch.breakTimer = { ...breakTimer, filePath: breakFilePath };
        }
      }
      if (Object.keys(patch).length > 0) await this.plugin.patchSettings(patch);
    });
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
    const breakSaved = await this.endBreakNow(); // работа началась, перерыв записан в заметку
    if (!breakSaved) return;
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

  /** Safely moves an active timer anchor, optionally stopping it at a fixed time. */
  async reanchor(
    filePath: string,
    expectedLineNo: number,
    expectedLineText: string,
    nextLineNo: number,
    nextLineText: string,
    stoppedAt: number | null = null,
  ): Promise<boolean> {
    return this.serialize(async () => {
      const running = this.running;
      if (!running
        || running.filePath !== filePath
        || running.lineNo !== expectedLineNo
        || running.lineText !== expectedLineText) {
        return false;
      }
      if (running.stoppedAt !== undefined) {
        const previousBaseline = elapsedBaseline(running.lineText);
        const nextBaseline = elapsedBaseline(nextLineText);
        if (previousBaseline === null || nextBaseline !== previousBaseline) return false;
        await this.setRunning({ ...running, lineNo: nextLineNo, lineText: nextLineText });
        await this.stopNow();
        return this.running === null;
      }
      const reanchored: RunningTimer = {
        ...running,
        lineNo: nextLineNo,
        lineText: nextLineText,
        ...(stoppedAt === null ? {} : { stoppedAt: Math.max(running.startedAt, stoppedAt) }),
      };
      await this.setRunning(reanchored);
      if (stoppedAt === null) return true;
      await this.stopNow();
      return this.running === null;
    });
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

  private get breakTimer(): PersistedBreak | null {
    return this.plugin.settings.breakTimer ?? null;
  }

  private async setBreak(timer: PersistedBreak | null): Promise<void> {
    await this.plugin.patchSettings({ breakTimer: timer });
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

  private async clearCommittedBreak(pending: PersistedBreak): Promise<boolean> {
    try {
      await this.setBreak(null);
      return true;
    } catch (error) {
      console.error("Always-on-Top Tasks: failed to clear committed break", error);
    }

    try {
      await this.setBreak(null);
      return true;
    } catch (error) {
      console.error("Always-on-Top Tasks: failed to retry clearing committed break", error);
      this.plugin.settings = { ...this.plugin.settings, breakTimer: pending };
      notify(
        "the break was saved, but its pending state could not be cleared. Retry after settings storage recovers.",
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

function elapsedBaseline(line: string): number | null {
  const body = line.endsWith("\r") ? line.slice(0, -1) : line;
  const parsed = parseTaskLine(body);
  return parsed ? parsed.elapsedSeconds ?? 0 : null;
}

function renamedPath(
  path: string,
  oldPath: string,
  newPath: string,
  folder: boolean,
): string {
  if (path === oldPath) return newPath;
  if (folder && path.startsWith(`${oldPath}/`)) {
    return `${newPath}${path.slice(oldPath.length)}`;
  }
  return path;
}
