import type { TAbstractFile, TFile } from "obsidian";
import type TasksForFocusPlugin from "./main";
import {
  reconcileFocusSession,
  reanchorFocusSessionTask,
  scanFocusTasks,
  type FocusCandidate,
  type FocusSession,
  type FocusTask,
} from "./core/focusSession";
import { parseStatusPalette } from "./core/taskLine";

function isTFile(file: TAbstractFile | null): file is TFile {
  return file !== null && "extension" in file;
}

export class FocusSessionService {
  private operationQueue: Promise<void> = Promise.resolve();

  constructor(private readonly plugin: TasksForFocusPlugin) {}

  get session(): FocusSession | null {
    return this.plugin.settings.focusSession;
  }

  async start(filePath: string, selected: FocusCandidate[]): Promise<void> {
    return this.serialize(async () => {
      const existing = this.session;
      if (existing && existing.status !== "finished") {
        throw new Error("A focus session is already in progress.");
      }

      const content = await this.readLatest(filePath);
      this.validateSelection(selected, content);
      await this.stopAnyTimer();
      await this.endBreakSafely();
      const latestContent = await this.readLatest(filePath);
      const tasks = this.validateSelection(selected, latestContent);

      const startedAt = Date.now();
      const next: FocusSession = {
        filePath,
        tasks,
        status: "active",
        startedAt,
        activeSince: startedAt,
        elapsedMs: 0,
        finishedAt: null,
      };
      await this.persistSession(next);
      await this.startTaskTimer(next, tasks[0]);
    });
  }

  async sync(filePath: string, content: string): Promise<void> {
    const observedAt = Date.now();
    return this.serialize(async () => this.syncNow(filePath, content, observedAt));
  }

  async refresh(filePath: string): Promise<void> {
    const observedAt = Date.now();
    return this.serialize(async () => {
      const content = await this.readLatestOrMissing(filePath);
      await this.syncNow(filePath, content ?? "", observedAt);
    });
  }

  async pause(startBreak = false): Promise<void> {
    const pausedAt = Date.now();
    return this.serialize(async () => {
      const current = this.requireUnfinishedSession();
      let paused = current;
      if (current.status === "active") {
        paused = {
          ...current,
          status: "paused",
          activeSince: null,
          elapsedMs: current.elapsedMs + activeDelta(current, pausedAt),
        };
        await this.persistSession(paused);
      }
      const content = await this.readLatestOrMissing(paused.filePath);
      await this.syncNow(paused.filePath, content ?? "", pausedAt);
      paused = this.requireUnfinishedSession();
      await this.stopSessionTimer(paused);
      if (startBreak && this.plugin.settings.breaksEnabled) {
        await this.plugin.timers.startBreak(paused.filePath);
      }
    });
  }

  async resume(): Promise<void> {
    return this.serialize(async () => {
      let current = this.requireUnfinishedSession();
      const content = await this.readLatest(current.filePath);
      await this.syncNow(current.filePath, content);
      current = this.requireUnfinishedSession();

      const nextTask = current.tasks.find((task) => !task.done && !task.missing);
      if (!nextTask) return;
      this.refusePendingTimer();
      await this.endBreakSafely();
      if (current.status === "paused") {
        current = { ...current, status: "active", activeSince: Date.now() };
        await this.persistSession(current);
      }
      await this.startTaskTimer(current, nextTask);
    });
  }

  async finish(): Promise<void> {
    const requestedAt = Date.now();
    return this.serialize(async () => {
      let current = this.session;
      if (!current) throw new Error("There is no focus session to finish.");
      if (current.status === "finished") return;

      if (current.status === "active") {
        current = {
          ...current,
          status: "paused",
          activeSince: null,
          elapsedMs: current.elapsedMs + activeDelta(current, requestedAt),
        };
        await this.persistSession(current);
      }

      const beforeStop = await this.readLatestOrMissing(current.filePath);
      await this.syncNow(current.filePath, beforeStop ?? "", requestedAt);
      current = this.requireUnfinishedSession();
      await this.stopSessionTimer(current);
      await this.endBreakSafely();
      const content = await this.readLatestOrMissing(current.filePath);
      await this.syncNow(current.filePath, content ?? "");
      current = this.requireUnfinishedSession();

      const finished: FocusSession = {
        ...current,
        status: "finished",
        activeSince: null,
        finishedAt: Math.max(requestedAt, current.startedAt),
      };
      await this.persistSession(finished);
    });
  }

  async clear(): Promise<void> {
    return this.serialize(async () => {
      const current = this.session;
      if (!current || current.status !== "finished") {
        throw new Error("Only a finished focus session can be cleared.");
      }
      await this.persistSession(null);
    });
  }

  async renamePaths(oldPath: string, newPath: string, folder: boolean): Promise<void> {
    return this.serialize(async () => {
      const current = this.session;
      if (!current) return;
      const filePath = renamedPath(current.filePath, oldPath, newPath, folder);
      if (filePath === current.filePath) return;
      await this.persistSession({ ...current, filePath });
    });
  }

  async reanchor(
    filePath: string,
    lineNo: number,
    oldLine: string,
    newLine: string,
  ): Promise<void> {
    return this.serialize(async () => {
      const current = this.session;
      if (!current) return;
      const next = reanchorFocusSessionTask(
        current,
        filePath,
        lineNo,
        oldLine,
        newLine,
        this.palette,
      );
      if (next !== current) await this.persistSession(next);
    });
  }

  private get palette(): readonly string[] {
    return parseStatusPalette(this.plugin.settings.statusEmojis);
  }

  private async syncNow(filePath: string, content: string, observedAt = Date.now()): Promise<void> {
    const current = this.session;
    if (!current || current.status === "finished" || current.filePath !== filePath) return;
    let next = reconcileFocusSession(current, content, this.palette);
    if (next.status === "active" && next.tasks.every((task) => task.done)) {
      next = {
        ...next,
        status: "paused",
        activeSince: null,
        elapsedMs: next.elapsedMs + activeDelta(next, observedAt),
      };
    }
    if (next !== current) await this.persistSession(next);
    await this.reanchorRunningTimer(filePath, content, observedAt);
  }

  private async reanchorRunningTimer(
    filePath: string,
    content: string,
    observedAt: number,
  ): Promise<void> {
    const running = this.plugin.timers.running;
    if (!running || running.filePath !== filePath) return;
    const runningTitle = scanFocusTasks(running.lineText, this.palette)[0]?.text;
    if (!runningTitle) return;
    if (!this.session?.tasks.some((task) => task.text === runningTitle)) return;
    const matches = scanFocusTasks(content, this.palette)
      .filter((candidate) => candidate.text === runningTitle);
    if (matches.length !== 1) return;
    const match = matches[0];
    if (!match.checked
      && running.lineNo === match.lineNo
      && running.lineText === match.lineText) return;
    const stopAt = match.checked ? observedAt : null;
    const handled = await this.plugin.timers.reanchor(
      filePath,
      running.lineNo,
      running.lineText,
      match.lineNo,
      match.lineText,
      stopAt,
    );
    if (!handled && stopAt !== null && this.plugin.timers.running?.stoppedAt !== undefined) {
      throw new Error("The completed task timer could not be saved. Retry before continuing.");
    }
  }

  private validateSelection(selected: FocusCandidate[], content: string): FocusTask[] {
    if (selected.length < 1 || selected.length > 20) {
      throw new Error("Choose between 1 and 20 eligible tasks.");
    }
    if (selected.some((candidate) => candidate.checked || !candidate.eligible)) {
      throw new Error("The selection contains a completed or ambiguous task.");
    }

    const requestedTitles = selected.map((candidate) => candidate.text.trim());
    if (requestedTitles.some((title) => !title)
      || new Set(requestedTitles).size !== requestedTitles.length) {
      throw new Error("Each selected task must have a unique title.");
    }

    const latest = scanFocusTasks(content, this.palette);
    const tasks = requestedTitles.map((title) => latest.find((candidate) =>
      candidate.text === title && candidate.eligible));
    if (tasks.some((task) => task === undefined)) {
      throw new Error("The selected tasks changed. Review the note and choose again.");
    }

    return (tasks as FocusCandidate[])
      .sort((left, right) => left.lineNo - right.lineNo)
      .map((task) => ({
        lineNo: task.lineNo,
        lineText: task.lineText,
        text: task.text,
        done: false,
        missing: false,
      }));
  }

  private async readLatest(filePath: string): Promise<string> {
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!isTFile(file)) throw new Error(`Focus note "${filePath}" was not found.`);
    return this.plugin.app.vault.read(file);
  }

  private async readLatestOrMissing(filePath: string): Promise<string | null> {
    const file = this.plugin.app.vault.getAbstractFileByPath(filePath);
    if (!isTFile(file)) return null;
    return this.plugin.app.vault.read(file);
  }

  private async stopAnyTimer(): Promise<void> {
    if (!this.plugin.timers.running) return;
    await this.plugin.timers.stop();
    if (this.plugin.timers.running) {
      throw new Error("Save the pending task timer before starting a focus session.");
    }
  }

  private async stopSessionTimer(session: FocusSession): Promise<void> {
    const running = this.plugin.timers.running;
    if (!running) return;
    if (running.filePath !== session.filePath) {
      throw new Error("A task timer from another note is still running.");
    }
    await this.plugin.timers.stop();
    if (this.plugin.timers.running) {
      throw new Error("The task timer could not be saved. Retry before continuing.");
    }
  }

  private async endBreakSafely(): Promise<void> {
    await this.plugin.timers.endBreak();
    if (this.plugin.timers.breakStartedAt !== null) {
      throw new Error("The break could not be saved. Retry before continuing.");
    }
  }

  private refusePendingTimer(): void {
    if (this.plugin.timers.running?.stoppedAt !== undefined) {
      throw new Error("Save the pending task timer before continuing the focus session.");
    }
  }

  private async startTaskTimer(session: FocusSession, task: FocusTask): Promise<void> {
    this.refusePendingTimer();
    const running = this.plugin.timers.running;
    if (running
      && running.filePath === session.filePath
      && running.lineNo === task.lineNo
      && running.lineText === task.lineText) {
      return;
    }
    await this.plugin.timers.start(session.filePath, task.lineNo, task.lineText);
    const started = this.plugin.timers.running;
    if (!started
      || started.stoppedAt !== undefined
      || started.filePath !== session.filePath
      || started.lineNo !== task.lineNo
      || started.lineText !== task.lineText) {
      throw new Error("The task timer did not start. Retry the focus session action.");
    }
  }

  private requireUnfinishedSession(): FocusSession {
    const current = this.session;
    if (!current || current.status === "finished") {
      throw new Error("There is no active focus session.");
    }
    return current;
  }

  private async persistSession(next: FocusSession | null): Promise<void> {
    const previous = this.session;
    try {
      await this.plugin.patchSettings({ focusSession: next });
    } catch (error) {
      this.plugin.settings = { ...this.plugin.settings, focusSession: previous };
      const detail = error instanceof Error ? ` ${error.message}` : "";
      throw new Error(`Could not save the focus session.${detail}`);
    }
  }

  private serialize(operation: () => Promise<void>): Promise<void> {
    const result = this.operationQueue.then(operation);
    this.operationQueue = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }
}

function activeDelta(session: FocusSession, stoppedAt: number): number {
  if (session.activeSince === null) return 0;
  return Math.max(0, stoppedAt - session.activeSince);
}

function renamedPath(path: string, oldPath: string, newPath: string, folder: boolean): string {
  if (path === oldPath) return newPath;
  if (folder && path.startsWith(`${oldPath}/`)) {
    return `${newPath}${path.slice(oldPath.length)}`;
  }
  return path;
}
