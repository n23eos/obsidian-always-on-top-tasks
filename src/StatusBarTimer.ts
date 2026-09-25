// Бегущий таймер в статус-баре главного окна: видно, что идёт, даже когда
// overlay закрыт. Клик останавливает таймер.

import { setIcon } from "obsidian";
import type TasksForFocusPlugin from "./main";
import { formatDuration, parseTaskLine } from "./core/taskLine";
import { notify } from "./notify";

const MAX_TASK_CHARS = 32;

export class StatusBarTimer {
  private el: HTMLElement | null = null;
  private textEl: HTMLElement | null = null;

  constructor(private readonly plugin: TasksForFocusPlugin) {}

  /** Создать или убрать элемент по настройке. */
  sync(): void {
    const wanted = this.plugin.settings.statusBarTimer;
    if (wanted && !this.el) {
      const el = this.plugin.addStatusBarItem();
      el.addClasses(["tfa-statusbar", "mod-clickable"]);
      el.setAttribute("aria-label", "Stop the running timer");
      el.setAttribute("role", "button");
      el.tabIndex = 0;
      const stop = () => {
        void this.plugin.stopRunningTimer().catch((error: unknown) => {
          console.error("Always-on-Top Tasks: timer action failed", error);
          notify("could not finish the timer action. Retry save.");
        });
      };
      el.addEventListener("click", stop);
      el.addEventListener("keydown", (event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          stop();
        }
      });
      this.el = el;
      const icon = el.createSpan({ cls: "tfa-statusbar-icon" });
      setIcon(icon, "timer");
      this.textEl = el.createSpan();
    } else if (!wanted && this.el) {
      this.el.remove();
      this.el = null;
      this.textEl = null;
    }
    this.tick();
  }

  /** Раз в секунду: текст обновляем, элемент прячем без таймера. */
  tick(): void {
    if (!this.el) return;
    const timer = this.plugin.settings.runningTimer;
    if (!timer) {
      this.el.hide();
      return;
    }
    const parsed = parseTaskLine(timer.lineText);
    const baseSeconds = parsed?.elapsedSeconds ?? 0;
    const sessionSeconds = Math.max(0, Math.floor(((timer.stoppedAt ?? Date.now()) - timer.startedAt) / 1000));
    const text = truncate(parsed?.text ?? timer.lineText);
    this.el.setAttribute("aria-label", timer.stoppedAt === undefined ? "Stop the running timer" : "Retry save");

    this.textEl?.setText(` ${formatDuration(baseSeconds + sessionSeconds)} · ${text}${timer.stoppedAt === undefined ? "" : " · Retry save"}`);
    this.el.show();
  }
}

function truncate(text: string): string {
  return text.length > MAX_TASK_CHARS ? `${text.slice(0, MAX_TASK_CHARS - 1)}…` : text;
}
