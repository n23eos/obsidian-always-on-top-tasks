// Minimal browser adapter for the local UI preview.
function create(tag, options = {}) {
  const el = document.createElement(tag);
  if (options.cls) el.className = options.cls;
  if (options.text) el.textContent = options.text;
  if (options.type) el.type = options.type;
  for (const [key, value] of Object.entries(options.attr ?? {})) el.setAttribute(key, value);
  return el;
}
globalThis.createDiv = (options) => create("div", options);
Object.assign(HTMLElement.prototype, {
  createEl(tag, options) { const el = create(tag, options); this.append(el); return el; },
  createDiv(options) { return this.createEl("div", options); },
  createSpan(options) { return this.createEl("span", options); },
  addClass(cls) { this.classList.add(cls); },
  addClasses(classes) { this.classList.add(...classes); },
  empty() { this.replaceChildren(); },
  setText(text) { this.textContent = text; },
  hide() { this.style.display = "none"; },
  show() { this.style.removeProperty("display"); },
});
export class TFile {
  constructor(path) { this.path = path; this.basename = path.replace(/\.md$/, ""); this.extension = "md"; }
}
export class WorkspaceLeaf {}
export class ItemView {
  constructor() { this.contentEl = document.querySelector("#overlay"); this.intervals = []; }
  registerEvent() {}
  registerDomEvent(el, event, handler) { el.addEventListener(event, handler); }
  registerInterval(id) { this.intervals.push(id); }
  async setState() {}
}
export class Notice {
  constructor(text) { document.querySelector("#notice").textContent = text; }
}
export const MarkdownRenderer = {
  async render(_app, text, el) { el.textContent = text; },
};
export function setIcon(el, name) {
  const paths = {
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    square: '<rect x="4" y="4" width="16" height="16" rx="2"/>',
    "rotate-cw": '<path d="M21 2v6h-6M21 8a9 9 0 1 0 0 8"/>',
    timer: '<path d="M10 2h4M12 14v-4"/><circle cx="12" cy="14" r="8"/>',
    eye: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
    "eye-off": '<path d="m3 3 18 18M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Z"/>',
    pin: '<path d="M12 17v5M5 17h14l-3-5V3H8v9z"/>',
    "pin-off": '<path d="m3 3 18 18M12 17v5M5 17h14l-3-5V3H8v9z"/>',
    x: '<path d="m6 6 12 12M18 6 6 18"/>',
  };
  el.innerHTML = `<svg class="svg-icon" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] ?? paths.timer}</svg>`;
}
