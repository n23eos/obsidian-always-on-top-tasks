import { describe, expect, it, vi } from "vitest";
import { FocusSessionPanel } from "../src/overlay/FocusSessionPanel";
import { DEFAULT_SETTINGS } from "../src/settings";
import { scanFocusTasks } from "../src/core/focusSession";

class Element {
  children: Element[] = [];
  attrs: Record<string, string> = {};
  handlers: Record<string, () => void> = {};
  value = "";
  disabled = false;
  textContent = "";
  constructor(readonly tag: string, readonly text = "") {}
  private create(tag: string, options: { text?: string; attr?: Record<string, string> } = {}): Element {
    const child = new Element(tag, options.text);
    child.attrs = options.attr ?? {};
    this.children.push(child);
    return child;
  }
  createEl(tag: string, options = {}): Element { return this.create(tag, options); }
  createDiv(options = {}): Element { return this.create("div", options); }
  createSpan(options = {}): Element { return this.create("span", options); }
  setAttribute(key: string, value: string): void { this.attrs[key] = value; }
  addEventListener(event: string, handler: () => void): void { this.handlers[event] = handler; }
  all(): Element[] { return this.children.flatMap(child => [child, ...child.all()]); }
}

function setup(enabled = true, count = 6) {
  const start = vi.fn(async () => undefined);
  const patchSettings = vi.fn(async () => undefined);
  const plugin = {
    settings: { ...DEFAULT_SETTINGS, focusSessionsEnabled: enabled },
    focusSessions: { session: null, start }, patchSettings,
  };
  const panel = new FocusSessionPanel(plugin as never, { render: vi.fn(), openNote: vi.fn() });
  const candidates = scanFocusTasks(Array.from({ length: count }, (_, i) => `- [ ] Task ${i}`).join("\n"));
  const render = () => {
    const parent = new Element("div");
    panel.render(parent as unknown as HTMLElement, "a.md", candidates);
    return parent.all();
  };
  return { start, patchSettings, render };
}

describe("session setup clarity", () => {
  it("has one labeled numeric control instead of duplicate preset buttons", () => {
    const elements = setup().render();
    const inputs = elements.filter(el => el.tag === "input");
    expect(inputs).toHaveLength(1);
    expect(inputs[0].value).toBe("3");
    expect(inputs[0].attrs["aria-label"]).toBe("Number of tasks in this session");
    expect(elements.some(el => el.tag === "span" && el.text === "Number of tasks in this session")).toBe(true);
    expect(elements.filter(el => el.tag === "button").map(el => el.text)).toEqual(["Start session", "Choose tasks"]);
  });

  it("changes the count and starts exactly that many tasks", async () => {
    const { render, start, patchSettings } = setup();
    const input = render().find(el => el.tag === "input")!;
    input.value = "2";
    input.handlers.change();
    await Promise.resolve();
    expect(patchSettings).toHaveBeenCalledWith({ focusTaskGoal: 2 });
    render().find(el => el.text === "Start session")!.handlers.click();
    await vi.waitFor(() => expect(start).toHaveBeenCalledOnce());
    expect(start.mock.calls[0]).toEqual(["a.md", expect.arrayContaining([
      expect.objectContaining({ text: "Task 0" }), expect.objectContaining({ text: "Task 1" }),
    ])]);
    expect((start.mock.calls[0] as unknown[])[1]).toHaveLength(2);
  });

  it("shows the available count when fewer tasks exist than the default goal", () => {
    expect(setup(true, 1).render().find(el => el.tag === "input")!.value).toBe("1");
  });

  it("does not render setup when disabled", () => {
    expect(setup(false).render()).toHaveLength(0);
  });
});
