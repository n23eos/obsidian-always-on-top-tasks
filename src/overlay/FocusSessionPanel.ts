import type TasksForFocusPlugin from "../main";
import {
  elapsedSessionSeconds,
  type FocusCandidate,
  type FocusSession,
  type FocusTask,
} from "../core/focusSession";
import { formatDuration, parseTaskLine, parseStatusPalette } from "../core/taskLine";
import { notify } from "../notify";

interface PanelActions {
  render: () => void;
  openNote: (filePath: string) => Promise<void>;
}

/** Session controls keep their draft selection while the note is re-rendered. */
export class FocusSessionPanel {
  private selection: Set<string> | null = null;
  private selectionFile = "";
  private busy = false;
  private clockEl: HTMLElement | null = null;
  choosing = false;

  constructor(
    private readonly plugin: TasksForFocusPlugin,
    private readonly actions: PanelActions,
  ) {}

  currentTask(session: FocusSession): FocusTask | undefined {
    const timer = this.plugin.timers.running;
    const title = timer?.filePath === session.filePath
      ? parseTaskLine(timer.lineText.replace(/\r$/, ""), parseStatusPalette(this.plugin.settings.statusEmojis))?.text.trim()
      : undefined;
    return session.tasks.find((task) => !task.done && !task.missing && task.text === title)
      ?? session.tasks.find((task) => !task.done && !task.missing);
  }

  isSelected(task: FocusCandidate): boolean {
    return this.selection?.has(task.text) ?? false;
  }

  toggle(task: FocusCandidate): void {
    if (!task.eligible || this.busy) return;
    this.selection ??= new Set();
    if (this.selection.has(task.text)) this.selection.delete(task.text);
    else if (this.selection.size < 20) this.selection.add(task.text);
    else notify("choose up to 20 tasks for one session.");
    this.actions.render();
  }

  tick(): void {
    if (!this.plugin.settings.focusSessionsEnabled) return;
    const session = this.plugin.focusSessions.session;
    if (session) this.clockEl?.setText(formatDuration(elapsedSessionSeconds(session)));
  }

  render(parent: HTMLElement, filePath: string, candidates: FocusCandidate[]): void {
    this.clockEl = null;
    if (!this.plugin.settings.focusSessionsEnabled) {
      this.choosing = false;
      return;
    }
    const panel = parent.createDiv({ cls: "tfa-session" });
    panel.setAttribute("aria-label", "Focus session");
    const session = this.plugin.focusSessions.session;
    if (session) {
      this.choosing = false;
      this.renderSession(panel, session, filePath);
    } else {
      this.renderSetup(panel, filePath, candidates);
    }
  }

  private button(parent: HTMLElement, text: string, action: () => Promise<void> | void, primary = false): HTMLButtonElement {
    const button = parent.createEl("button", {
      cls: `tfa-session-btn${primary ? " tfa-session-primary" : ""}`,
      text,
    });
    button.disabled = this.busy;
    button.addEventListener("click", () => {
      if (this.busy) return;
      this.busy = true;
      button.disabled = true;
      void Promise.resolve().then(action).catch((error: unknown) => {
        console.error("Always-on-Top Tasks: focus session action failed", error);
        notify(error instanceof Error ? error.message : "could not save the session. Please retry.");
      }).finally(() => {
        this.busy = false;
        this.actions.render();
      });
    });
    return button;
  }

  private renderSetup(panel: HTMLElement, filePath: string, candidates: FocusCandidate[]): void {
    const eligible = candidates.filter((task) => task.eligible);
    if (filePath !== this.selectionFile) {
      this.selection = null;
      this.selectionFile = filePath;
      this.choosing = false;
    }
    if (!this.selection) {
      this.selection = new Set(eligible.slice(0, this.plugin.settings.focusTaskGoal).map((task) => task.text));
    }
    const available = new Set(eligible.map((task) => task.text));
    this.selection = new Set([...this.selection].filter((text) => available.has(text)));
    panel.createDiv({ cls: "tfa-session-eyebrow", text: "Focus session" });
    panel.createDiv({ cls: "tfa-session-heading", text: "Set up a session" });
    panel.createDiv({
      cls: "tfa-session-hint",
      text: eligible.length ? "Choose how many tasks to work on. The first open tasks are selected automatically." : "Add an open task to begin a session.",
    });

    if (eligible.length) {
      const goal = panel.createEl("label", { cls: "tfa-session-goal-control" });
      goal.createSpan({ text: "Number of tasks in this session" });
      const custom = goal.createEl("input", {
        type: "number",
        cls: "tfa-session-goal",
        attr: { min: "1", max: "20", step: "1", "aria-label": "Number of tasks in this session" },
      });
      custom.value = String(this.selection.size);
      custom.addEventListener("change", () => {
        const value = Number(custom.value);
        if (!Number.isInteger(value) || value < 1 || value > 20) {
          custom.value = String(this.selection?.size ?? 0);
          notify("choose a whole number from 1 to 20.");
          return;
        }
        this.selection = new Set(eligible.slice(0, value).map((task) => task.text));
        void this.plugin.patchSettings({ focusTaskGoal: value })
          .catch(() => notify("could not save the default goal."))
          .finally(() => this.actions.render());
      });
      const count = this.selection.size;
      const selected = eligible.filter((task) => this.selection?.has(task.text));
      panel.createDiv({
        cls: "tfa-session-selection",
        text: selected.length ? `First: ${selected[0].text}` : "Select at least one task below.",
      });
      const controls = panel.createDiv({ cls: "tfa-session-actions" });
      const start = this.button(controls, "Start session", async () => {
        await this.plugin.focusSessions.start(filePath, selected);
      }, true);
      start.disabled ||= count === 0;
      const choose = this.button(controls, this.choosing ? "Selection ready" : "Choose tasks", () => {
        this.choosing = !this.choosing;
      });
      choose.setAttribute("aria-pressed", String(this.choosing));
    }
    if (candidates.some((task) => !task.checked && !task.eligible)) {
      panel.createDiv({
        cls: "tfa-session-hint",
        text: "Give duplicate tasks distinct names to include them in a session.",
      });
    }
  }

  private renderSession(panel: HTMLElement, session: FocusSession, filePath: string): void {
    const done = session.tasks.filter((task) => task.done).length;
    const goal = session.tasks.length;
    const finished = session.status === "finished";
    const reached = done === goal;
    panel.classList.toggle("tfa-session-complete", reached);
    panel.createDiv({
      cls: "tfa-session-eyebrow",
      text: finished ? "Session saved" : reached ? "Plan complete" : session.status === "paused" ? "On pause" : "Focus session",
    });
    const heading = panel.createDiv({ cls: "tfa-session-heading" });
    heading.createSpan({ text: finished ? (reached ? "You finished your plan" : "A good place to stop") : reached ? "Goal reached" : "One task at a time" });
    const metrics = panel.createDiv({ cls: "tfa-session-metrics" });
    metrics.createSpan({ cls: "tfa-session-count", text: `${done} / ${goal} tasks` });
    const clock = metrics.createSpan({ cls: "tfa-session-clock", attr: { title: "Session time, excluding pauses" } });
    clock.createSpan({ text: "Session time " });
    this.clockEl = clock.createSpan({ text: formatDuration(elapsedSessionSeconds(session)) });
    const progress = panel.createEl("progress", {
      cls: "tfa-session-progress",
      attr: { max: String(goal), value: String(done), "aria-label": `${done} of ${goal} session tasks complete` },
    });
    progress.textContent = `${done}/${goal}`;

    if (finished) {
      panel.createDiv({ cls: "tfa-session-hint", text: reached ? "Your selected tasks are complete. Take a breather." : `${goal - done} tasks remain in your note for later.` });
      this.button(panel, "Plan another session", async () => {
        await this.plugin.focusSessions.clear();
        this.selection = null;
      }, true);
      return;
    }
    if (session.filePath !== filePath) {
      panel.createDiv({ cls: "tfa-session-hint", text: `Your session is in ${session.filePath}` });
      this.button(panel, "Return to session", () => this.actions.openNote(session.filePath), true);
      return;
    }
    const missing = session.tasks.filter((task) => task.missing);
    if (missing.length) {
      panel.createDiv({
        cls: "tfa-session-warning",
        text: `Cannot match: ${missing.map((task) => task.text).join(", ")}. Restore the task name in the note, or finish this session early.`,
        attr: { role: "status" },
      });
    }
    const controlsGroup = panel.createDiv({ cls: "tfa-session-controls" });
    const controls = controlsGroup.createDiv({ cls: "tfa-session-actions" });
    if (!reached) {
      if (session.status === "paused") {
        this.button(controls, "Resume focus", () => this.plugin.focusSessions.resume(), true);
      } else {
        this.button(controls, "Pause", () => this.plugin.focusSessions.pause(true));
      }
    }
    this.button(controls, reached ? "Finish session" : "Finish early", () => this.plugin.focusSessions.finish(), reached);
    const toggle = this.button(controls, this.plugin.settings.focusOnly ? "Show all tasks" : "Only current task",
      () => this.plugin.updateSettings({ focusOnly: !this.plugin.settings.focusOnly }));
    toggle.setAttribute("aria-pressed", String(this.plugin.settings.focusOnly));
    const current = this.currentTask(session);
    const remaining = session.tasks.filter((task) => !task.done && !task.missing && task !== current);
    if (remaining.length) {
      const details = controlsGroup.createEl("details", { cls: "tfa-session-queue" });
      details.createEl("summary", { text: `Up next · ${remaining.length} ${remaining.length === 1 ? "task" : "tasks"}` });
      const list = details.createEl("ol");
      for (const task of remaining) list.createEl("li", { text: task.text });
    }
    if (!reached && current) {
      panel.createDiv({ cls: "tfa-session-now", text: session.status === "paused" ? "Ready when you are" : "Now" });
    }
  }
}
