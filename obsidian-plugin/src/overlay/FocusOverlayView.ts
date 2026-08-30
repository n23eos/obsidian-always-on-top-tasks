// Overlay-вью: заметка как есть, задачи — строки с постоянными кнопками
// (таймер, эмодзи-статус). Все изменения пишутся в сам .md-файл.

import { ItemView, MarkdownRenderer, Notice, TFile, WorkspaceLeaf } from "obsidian";
import type TasksForFocusPlugin from "../main";
import {
  formatDuration,
  parseTaskLine,
  stripFrontmatter,
  withChecked,
  withStatusEmoji,
  withText,
  STATUS_EMOJIS,
  type ParsedTaskLine,
} from "../core/taskLine";
import { locateLine } from "../core/timer";

export const FOCUS_OVERLAY_VIEW_TYPE = "tfa-focus-overlay";

const RENDER_DEBOUNCE_MS = 300;
/** Пункт палитры «без статуса» — тот же пустой кружочек, что у задач без эмодзи. */
const REMOVE_GLYPH = "○";

/** Fire-and-forget из обработчиков кликов: ошибку показываем, не глотаем. */
function safe(promise: Promise<unknown>): void {
  promise.catch((error) => {
    console.error("Tasks for Focus ADHD", error);
    new Notice("Tasks for Focus: действие не удалось — см. консоль (Cmd+Opt+I).");
  });
}

interface OverlayViewState extends Record<string, unknown> {
  filePath?: string;
}

export class FocusOverlayView extends ItemView {
  private file: TFile | null = null;
  private renderTimeout: number | null = null;
  /** Строка (lineNo), под которой открыта полоска эмодзи. null = закрыта. */
  private openStripLineNo: number | null = null;
  /** Ререндер пришёл, пока открыта полоска — выполним после закрытия. */
  private pendingRender = false;
  /** Элемент времени бегущей задачи — тикаем только его, без ререндера. */
  private runningTimeEl: HTMLElement | null = null;
  private runningBaseSeconds = 0;
  /** Версия рендера: устаревший асинхронный рендер не должен трогать DOM. */
  private renderVersion = 0;
  /** Суммарное время в футере: элемент и база (без бегущей сессии). */
  private totalEl: HTMLElement | null = null;
  private totalBaseSeconds = 0;
  /** Черновик поля «+ задача». null = поле закрыто. Переживает ререндер. */
  private addDraft: string | null = null;
  /** Строка в режиме инлайн-редактирования (ререндер откладывается). */
  private editingLineNo: number | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: TasksForFocusPlugin) {
    super(leaf);
  }

  getViewType(): string {
    return FOCUS_OVERLAY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return this.file ? this.file.basename : "Focus";
  }

  getIcon(): string {
    return "target";
  }

  async setState(state: OverlayViewState, result: unknown): Promise<void> {
    const byPath = state.filePath
      ? this.plugin.app.vault.getAbstractFileByPath(state.filePath)
      : null;
    this.file = byPath instanceof TFile ? byPath : null;
    await this.render();
    await super.setState(state, result as never);
  }

  getState(): OverlayViewState {
    return { filePath: this.file?.path };
  }

  async onOpen(): Promise<void> {
    this.contentEl.addClass("tfa-overlay");
    // Хром прячем только в popout-окне — не в главном (вдруг вью перетащили).
    if (this.containerEl.win !== window) {
      this.containerEl.win.document.body.classList.add("tfa-popout-body");
    }

    this.registerEvent(
      this.plugin.app.vault.on("modify", (file) => {
        if (file.path === this.file?.path) this.scheduleRender();
      }),
    );
    this.registerEvent(
      this.plugin.app.vault.on("rename", (file, oldPath) => {
        if (oldPath === this.file?.path && file instanceof TFile) {
          this.file = file;
          this.scheduleRender();
        }
      }),
    );
    this.registerEvent(
      this.plugin.app.vault.on("delete", (file) => {
        if (file.path === this.file?.path) {
          this.file = null;
          this.scheduleRender();
        }
      }),
    );

    // Тик секундомера: только DOM активной строки, файл не трогаем.
    this.registerInterval(
      window.setInterval(() => this.tickRunningTimer(), 1000),
    );
  }

  async onClose(): Promise<void> {
    this.containerEl.win?.document.body.classList.remove("tfa-popout-body");
  }

  // ---------- рендер ----------

  /** Внешний запрос перерисовки (смена настроек). */
  requestRender(): void {
    this.scheduleRender();
  }

  private scheduleRender(): void {
    if (this.renderTimeout !== null) window.clearTimeout(this.renderTimeout);
    this.renderTimeout = window.setTimeout(() => {
      this.renderTimeout = null;
      if (this.openStripLineNo !== null || this.editingLineNo !== null) {
        this.pendingRender = true; // не рушим открытую палитру / редактирование
        return;
      }
      safe(this.render());
    }, RENDER_DEBOUNCE_MS);
  }

  private async render(): Promise<void> {
    // Рендер асинхронный: строим во временный контейнер и подменяем DOM одним
    // куском. Устаревшая версия (пришёл новый рендер) молча выбрасывается.
    const version = ++this.renderVersion;

    if (!this.file) {
      this.contentEl.empty();
      this.runningTimeEl = null;
      this.contentEl.createDiv({ cls: "tfa-empty", text: "Заметка не выбрана или удалена." });
      return;
    }

    const content = await this.plugin.app.vault.cachedRead(this.file);
    if (version !== this.renderVersion) return;

    const stripped = stripFrontmatter(content);
    // Абсолютная нумерация строк файла — frontmatter только скрыт, не удалён.
    const offset = content.split("\n").length - stripped.split("\n").length;
    const lines = stripped.split("\n");

    const built = createDiv();
    const runningRef: { timeEl: HTMLElement | null; baseSeconds: number } = {
      timeEl: null,
      baseSeconds: 0,
    };
    let totalSeconds = 0;
    let taskCount = 0;
    let doneCount = 0;

    let mdBuffer: string[] = [];
    const flushMarkdown = async () => {
      const text = mdBuffer.join("\n").trim();
      mdBuffer = [];
      if (!text) return;
      const block = built.createDiv({ cls: "tfa-md" });
      await MarkdownRenderer.render(this.plugin.app, text, block, this.file?.path ?? "", this);
    };

    for (let i = 0; i < lines.length; i++) {
      const parsed = parseTaskLine(lines[i]);
      if (!parsed) {
        mdBuffer.push(lines[i]);
        continue;
      }
      await flushMarkdown();
      totalSeconds += parsed.elapsedSeconds ?? 0;
      taskCount += 1;
      if (parsed.checked) doneCount += 1;
      this.renderTaskRow(built, offset + i, lines[i], parsed, runningRef);
    }
    await flushMarkdown();

    if (version !== this.renderVersion) return; // пришёл более свежий рендер

    const footer = built.createDiv({ cls: "tfa-add" });
    this.renderAddRowButton(footer);
    if (taskCount > 0) {
      footer.createSpan({ cls: "tfa-count", text: `${doneCount}/${taskCount}` });
    }
    const totalTimeEl =
      totalSeconds > 0 || runningRef.timeEl
        ? footer.createSpan({ cls: "tfa-total", text: `Σ ${formatDuration(totalSeconds)}` })
        : null;

    this.contentEl.empty();
    while (built.firstChild) this.contentEl.appendChild(built.firstChild);
    this.runningTimeEl = runningRef.timeEl;
    this.runningBaseSeconds = runningRef.baseSeconds;
    this.totalEl = totalTimeEl;
    this.totalBaseSeconds = totalSeconds;
    if (this.runningTimeEl) this.tickRunningTimer();

    // Поле добавления было открыто до ререндера — восстановим с черновиком.
    if (this.addDraft !== null) {
      const addRow = this.contentEl.querySelector<HTMLElement>(".tfa-add");
      if (addRow) this.openAddInput(addRow);
    }
  }

  // ---------- добавление задачи ----------

  private openAddInput(addRow: HTMLElement): void {
    addRow.empty();
    const input = addRow.createEl("input", {
      cls: "tfa-input",
      attr: { placeholder: "Новая задача… (Enter — ещё одна, Esc — закрыть)" },
    });
    input.value = this.addDraft ?? "";
    input.addEventListener("input", () => {
      this.addDraft = input.value;
    });
    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") {
        const text = input.value.trim();
        if (!text) return;
        this.addDraft = "";
        input.value = "";
        safe(this.appendTask(text)); // поле остаётся открытым — можно серию
      } else if (event.key === "Escape") {
        this.closeAddInput(addRow);
      }
    });
    input.addEventListener("blur", () => {
      // Урок SimpleFocus: брошенное поле не должно застревать.
      const text = input.value.trim();
      if (text) safe(this.appendTask(text));
      // input мог быть уже удалён ререндером — проверяем связь с DOM
      if (addRow.isConnected) this.closeAddInput(addRow);
      else this.addDraft = null;
    });
    input.focus();
  }

  private closeAddInput(addRow: HTMLElement): void {
    this.addDraft = null;
    addRow.empty();
    this.renderAddRowButton(addRow);
  }

  private renderAddRowButton(addRow: HTMLElement): void {
    const button = addRow.createEl("button", { cls: "tfa-add-btn", text: "+ задача" });
    button.addEventListener("click", () => {
      this.addDraft = "";
      this.openAddInput(addRow);
    });
  }

  /** Дописывает "- [ ] текст" в конец файла, сохраняя стиль хвостовой \n. */
  private async appendTask(text: string): Promise<void> {
    if (!this.file) return;
    const taskLine = `- [ ] ${text}`;
    await this.plugin.app.vault.process(this.file, (content) => {
      if (content.trim() === "") return `${taskLine}\n`;
      return content.endsWith("\n") ? `${content}${taskLine}\n` : `${content}\n${taskLine}`;
    });
  }

  private renderTaskRow(
    container: HTMLElement,
    lineNo: number,
    rawLine: string,
    parsed: ParsedTaskLine,
    runningRef: { timeEl: HTMLElement | null; baseSeconds: number },
  ): void {
    const isRunning = this.file
      ? this.plugin.timers.isRunningOn(this.file.path, rawLine)
      : false;

    const row = container.createDiv({
      cls: `tfa-task${parsed.checked ? " tfa-done" : ""}${isRunning ? " tfa-running" : ""}`,
    });
    row.style.paddingLeft = `${parsed.indent.replace(/\t/g, "  ").length * 8}px`;

    const checkbox = row.createEl("input", { type: "checkbox", cls: "tfa-check" });
    checkbox.checked = parsed.checked;
    checkbox.addEventListener("click", (event) => {
      event.preventDefault(); // состояние меняет только запись в файл
      safe(this.onToggleCheckbox(lineNo, rawLine, parsed));
    });

    if (this.plugin.settings.showEmojiButton) {
      const emojiButton = row.createEl("button", {
        cls: `tfa-btn tfa-emoji${parsed.statusEmoji ? "" : " tfa-emoji-empty"}`,
        text: parsed.statusEmoji ?? "○",
        attr: { "aria-label": "Статус задачи" },
      });
      emojiButton.addEventListener("click", () => this.toggleEmojiStrip(row, lineNo, rawLine));
    }

    // Кнопка скрыта — статус остаётся видимым текстом перед задачей.
    const textPrefix =
      !this.plugin.settings.showEmojiButton && parsed.statusEmoji
        ? `${parsed.statusEmoji} `
        : "";
    const textSpan = row.createSpan({ cls: "tfa-text", text: textPrefix + parsed.text });
    textSpan.addEventListener("click", () =>
      this.startEditTask(row, textSpan, lineNo, rawLine, parsed),
    );

    const baseSeconds = parsed.elapsedSeconds ?? 0;
    const timeEl = row.createSpan({
      cls: "tfa-time",
      text: baseSeconds > 0 || isRunning ? formatDuration(baseSeconds) : "",
    });

    const timerButton = row.createEl("button", {
      cls: `tfa-btn tfa-timer${isRunning ? " tfa-timer-on" : ""}`,
      text: isRunning ? "⏹" : "▶",
      attr: { "aria-label": isRunning ? "Остановить таймер" : "Запустить таймер" },
    });
    timerButton.addEventListener("click", () => safe(this.onToggleTimer(lineNo, rawLine)));

    if (isRunning) {
      runningRef.timeEl = timeEl;
      runningRef.baseSeconds = baseSeconds;
    }
  }

  // ---------- действия ----------

  private async onToggleCheckbox(
    lineNo: number,
    rawLine: string,
    parsed: ParsedTaskLine,
  ): Promise<void> {
    if (!this.file) return;
    let targetLineNo = lineNo;
    let targetText = rawLine;

    if (!parsed.checked && this.plugin.timers.isRunningOn(this.file.path, rawLine)) {
      // Завершение задачи с бегущим таймером: сперва коммит времени.
      const result = await this.plugin.timers.stop();
      if (result?.kind === "ok" && result.newLineText !== undefined && result.lineNo !== undefined) {
        targetLineNo = result.lineNo;
        targetText = result.newLineText;
      }
    }

    // Только чекбокс: ✅ не ставим — иначе двойная галочка в строке.
    const transform = (line: string) => withChecked(line, !parsed.checked);

    await this.updateLine(targetLineNo, targetText, transform);
    this.plugin.overlay.blur();
  }

  private async onToggleTimer(lineNo: number, rawLine: string): Promise<void> {
    if (!this.file) return;

    if (this.plugin.timers.isRunningOn(this.file.path, rawLine)) {
      await this.plugin.timers.stop();
    } else {
      await this.plugin.timers.start(this.file.path, lineNo, rawLine);
      this.scheduleRender(); // старт не меняет файл — обновим вид сами
    }
    this.plugin.overlay.blur();
  }

  private toggleEmojiStrip(row: HTMLElement, lineNo: number, rawLine: string): void {
    const alreadyOpen = this.openStripLineNo === lineNo;
    this.closeEmojiStrip();
    if (alreadyOpen) return;

    this.openStripLineNo = lineNo;
    const strip = createDiv({ cls: "tfa-strip" });
    row.insertAdjacentElement("afterend", strip);

    for (const emoji of [REMOVE_GLYPH, ...STATUS_EMOJIS]) {
      const isRemove = emoji === REMOVE_GLYPH;
      const button = strip.createEl("button", {
        cls: `tfa-btn tfa-strip-btn${isRemove ? " tfa-strip-remove" : ""}`,
        text: emoji,
        attr: { "aria-label": isRemove ? "Без статуса" : emoji },
      });
      button.addEventListener("click", () => {
        safe(
          (async () => {
            this.closeEmojiStrip();
            await this.updateLine(lineNo, rawLine, (line) =>
              withStatusEmoji(line, isRemove ? null : emoji),
            );
            this.plugin.overlay.blur();
          })(),
        );
      });
    }
  }

  private closeEmojiStrip(): void {
    this.openStripLineNo = null;
    this.contentEl.querySelectorAll(".tfa-strip").forEach((el) => el.remove());
    if (this.pendingRender) {
      this.pendingRender = false;
      safe(this.render());
    }
  }

  // ---------- инлайн-редактирование текста задачи ----------

  private startEditTask(
    row: HTMLElement,
    textSpan: HTMLElement,
    lineNo: number,
    rawLine: string,
    parsed: ParsedTaskLine,
  ): void {
    if (this.editingLineNo !== null) return; // редактируем по одной
    this.editingLineNo = lineNo;

    textSpan.hide();
    const input = row.createEl("input", { cls: "tfa-input tfa-edit" });
    row.insertBefore(input, textSpan);
    input.value = parsed.text;

    const finish = () => {
      this.editingLineNo = null;
      input.remove();
      textSpan.show();
      if (this.pendingRender) {
        this.pendingRender = false;
        safe(this.render());
      }
    };

    const commit = () => {
      const newText = input.value.trim();
      if (!newText || newText === parsed.text) {
        finish(); // пусто или без изменений = отмена, задачу молча не удаляем
        return;
      }
      finish();
      safe(this.updateLine(lineNo, rawLine, (line) => withText(line, newText)));
    };

    input.addEventListener("keydown", (event) => {
      if (event.key === "Enter") commit();
      else if (event.key === "Escape") finish();
    });
    input.addEventListener("blur", () => {
      if (this.editingLineNo === lineNo) commit();
    });
    input.focus();
    input.select();
  }

  /** Атомарная правка одной строки с верификацией (lineNo + точный текст). */
  private async updateLine(
    lineNo: number,
    expectedText: string,
    transform: (line: string) => string,
  ): Promise<void> {
    if (!this.file) return;
    let applied = false;
    let newLineText = "";
    let newIndex = -1;
    await this.plugin.app.vault.process(this.file, (content) => {
      const lines = content.split("\n");
      const index = locateLine(lines, lineNo, expectedText);
      if (index === null) return content; // строка изменилась под нами — не портим
      applied = true;
      newIndex = index;
      newLineText = transform(lines[index]);
      return lines.map((line, i) => (i === index ? newLineText : line)).join("\n");
    });
    if (!applied) {
      new Notice("Tasks for Focus: строка изменилась, действие не применено. Попробуй ещё раз.");
      this.scheduleRender();
      return;
    }

    // Если переписали строку бегущего таймера (текст, эмодзи, чекбокс) —
    // перепривязываем якорь, иначе стоп таймера её не найдёт.
    const timer = this.plugin.settings.runningTimer;
    if (
      timer &&
      timer.filePath === this.file.path &&
      timer.lineText === expectedText &&
      newLineText !== expectedText
    ) {
      this.plugin.settings = {
        ...this.plugin.settings,
        runningTimer: { ...timer, lineNo: newIndex, lineText: newLineText },
      };
      await this.plugin.saveSettings();
    }
  }

  // ---------- тик ----------

  private tickRunningTimer(): void {
    const timer = this.plugin.settings.runningTimer;
    if (!timer || !this.runningTimeEl) return;
    const sessionSeconds = Math.max(0, Math.floor((Date.now() - timer.startedAt) / 1000));
    this.runningTimeEl.setText(formatDuration(this.runningBaseSeconds + sessionSeconds));
    // Суммарное время внизу тикает вместе с бегущей сессией.
    this.totalEl?.setText(`Σ ${formatDuration(this.totalBaseSeconds + sessionSeconds)}`);
  }
}
