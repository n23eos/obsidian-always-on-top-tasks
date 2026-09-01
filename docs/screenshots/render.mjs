// Renders the README screenshots from the plugin's own stylesheet.
//
// The markup below mirrors what FocusOverlayView builds at runtime (same class
// names, same element order) and it is styled by the real obsidian-plugin/styles.css,
// so the images stay truthful when the styles change. Re-run after editing styles:
//
//   node docs/screenshots/render.mjs
//
// Requires Google Chrome (headless). No npm dependencies.

import { execFileSync } from "child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "fs";
import { dirname, join, resolve } from "path";
import { fileURLToPath } from "url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "..", "..");
const outDir = here;
const tmpDir = join(here, ".tmp");

const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const SCALE = 2; // retina: a 700px-wide page becomes a 1400px-wide PNG

const pluginStyles = readFileSync(join(repoRoot, "styles.css"), "utf8");

/** Obsidian's dark-theme variables that styles.css relies on. */
const THEME = `
  :root {
    --background-primary: #1e1e1e;
    --background-secondary: #161616;
    --background-modifier-hover: rgba(255, 255, 255, 0.075);
    --background-modifier-border: #3a3a3a;
    --text-normal: #dadada;
    --text-muted: #999999;
    --text-faint: #666666;
    --interactive-accent: #7f6df2;
    --color-blue: #4b8bf5;
    --color-orange: #e0a33e;
  }

  * { box-sizing: border-box; }

  body {
    margin: 0;
    background: #101014;
    color: var(--text-normal);
    font-family: -apple-system, BlinkMacSystemFont, "Inter", "Segoe UI", sans-serif;
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
  }

  /* The overlay popout window: rounded frame + shadow, real width from settings. */
  .window {
    width: 340px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
    overflow: hidden;
  }

  /* A stand-in for whatever app the user is actually working in. */
  .behind {
    padding: 22px;
    background: #17171c;
    border: 1px solid #2a2a30;
    border-radius: 10px;
    display: flex;
    flex-direction: column;
    gap: 11px;
    overflow: hidden;
  }
  .behind .bar { height: 9px; border-radius: 5px; background: #24242c; }
  .behind .bar.accent { background: #2c2c3a; }
  .behind .caption {
    color: #4a4a55;
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    margin-bottom: 6px;
  }

  /* The overlay floats ON TOP of the other window, not next to it. */
  .stage { position: relative; width: 100%; height: 100%; }
  .stage .behind {
    position: absolute;
    inset: 22px 22px 22px 22px;
    margin: 0;
  }
  .stage .window {
    position: absolute;
    top: 10px;
    right: 10px;
    bottom: 10px;
    z-index: 2;
  }

  /* Raw markdown view for the "no hidden database" shot. */
  .source {
    width: 620px;
    padding: 20px 22px;
    background: var(--background-primary);
    border: 1px solid var(--background-modifier-border);
    border-radius: 10px;
    box-shadow: 0 18px 50px rgba(0, 0, 0, 0.55);
    font-family: "SFMono-Regular", "JetBrains Mono", Menlo, monospace;
    font-size: 13px;
    line-height: 1.75;
    white-space: pre;
    color: var(--text-normal);
  }
  .source .dim { color: var(--text-faint); }
`;

/** One task row, exactly as renderTaskRow() builds it. */
function taskRow({ text, emoji = null, time = "", checked = false, running = false, indent = 0 }) {
  const rowCls = `tfa-task${checked ? " tfa-done" : ""}${running ? " tfa-running" : ""}`;
  const emojiBtn =
    emoji === null
      ? `<button class="tfa-btn tfa-emoji tfa-emoji-empty">○</button>`
      : `<button class="tfa-btn tfa-emoji">${emoji}</button>`;
  const timerBtn = running
    ? `<button class="tfa-btn tfa-timer tfa-timer-on">⏹</button>`
    : `<button class="tfa-btn tfa-timer">▶</button>`;
  return `
    <div class="${rowCls}" style="--tfa-indent: ${indent * 8}px">
      <input type="checkbox" class="tfa-check"${checked ? " checked" : ""}>
      ${emojiBtn}
      <span class="tfa-text">${text}</span>
      <span class="tfa-time">${time}</span>
      ${timerBtn}
    </div>`;
}

const STATUS_EMOJIS = ["⬜", "🔄", "⏸️", "🔜", "⛔", "✅", "❗", "🔴", "🟠", "🟡", "🟢", "🔵", "🟣"];

function emojiStrip() {
  const buttons = [
    `<button class="tfa-btn tfa-strip-btn tfa-strip-remove">○</button>`,
    ...STATUS_EMOJIS.map((e) => `<button class="tfa-btn tfa-strip-btn">${e}</button>`),
  ].join("");
  return `<div class="tfa-strip">${buttons}</div>`;
}

const ICONS = {
  eye: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>`,
  pin: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>`,
  x: `<svg class="svg-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>`,
};

/** The sticky top block: header with note name and buttons, progress, running task. */
function topBlock({ title = "Today", progress = 0, pinned = null } = {}) {
  const pinnedEl = pinned
    ? `
      <div class="tfa-pinned">
        <span class="tfa-pinned-text">${pinned.text}</span>
        <span class="tfa-time">${pinned.time}</span>
        <button class="tfa-btn tfa-timer tfa-timer-on">⏹</button>
      </div>`
    : "";
  return `
    <div class="tfa-top">
      <div class="tfa-header">
        <span class="tfa-header-title">${title}</span>
        <button class="tfa-btn tfa-icon-btn">${ICONS.eye}</button>
        <button class="tfa-btn tfa-icon-btn">${ICONS.pin}</button>
        <button class="tfa-btn tfa-icon-btn">${ICONS.x}</button>
      </div>
      <div class="tfa-progress" style="--tfa-progress: ${progress}%"><div class="tfa-progress-fill"></div></div>
      ${pinnedEl}
    </div>`;
}

function footer({ count = null, total = null, breakTime = null } = {}) {
  const countEl = count ? `<span class="tfa-count">${count}</span>` : "";
  const totalEl = total ? `<span class="tfa-total">Σ ${total}</span>` : "";
  const breakEl =
    breakTime === null
      ? `<button class="tfa-btn tfa-break">☕</button>`
      : `<button class="tfa-btn tfa-break tfa-break-on">☕ ${breakTime}</button>`;
  return `
    <div class="tfa-add">
      <button class="tfa-add-btn">+ task</button>
      ${countEl}${totalEl}${breakEl}
    </div>`;
}

/** The note used across the screenshots — one realistic multi-project day. */
const NOTE_ROWS = [
  taskRow({ text: "Ship the payments hotfix", emoji: "🔵", time: "0:41:12", running: true }),
  taskRow({ text: "reproduce on staging", emoji: "✅", time: "0:12:40", indent: 1 }),
  taskRow({ text: "patch the retry logic", emoji: "🔄", time: "0:28:32", indent: 1 }),
  taskRow({ text: "Review Anna's pull request", emoji: "🔜", time: "0:06:55" }),
  taskRow({ text: "Write the release notes", emoji: null, time: "" }),
  taskRow({ text: "Reply on Slack", emoji: "✅", time: "0:04:18", checked: true }),
  taskRow({ text: "Book the standup room", emoji: "✅", time: "0:01:09", checked: true }),
];

const behindWindow = `
  <div class="behind">
    <div class="caption">whatever you are working in</div>
    <div class="bar" style="width: 78%"></div>
    <div class="bar accent" style="width: 54%"></div>
    <div class="bar" style="width: 88%"></div>
    <div class="bar" style="width: 41%"></div>
    <div class="bar accent" style="width: 69%"></div>
    <div class="bar" style="width: 83%"></div>
    <div class="bar" style="width: 36%"></div>
    <div class="bar accent" style="width: 74%"></div>
    <div class="bar" style="width: 58%"></div>
    <div class="bar" style="width: 91%"></div>
  </div>`;

const shots = [
  {
    name: "overlay-pinned",
    width: 700,
    height: 460,
    body: `
      <div class="stage">
        ${behindWindow}
        <div class="window">
          <div class="tfa-overlay">
            ${topBlock({ progress: 29, pinned: { text: "Ship the payments hotfix", time: "0:41:12" } })}
            ${NOTE_ROWS.join("")}
            ${footer({ count: "2/7", total: "1:34:46" })}
          </div>
        </div>
      </div>`,
  },
  {
    name: "running-task",
    width: 460,
    height: 370,
    body: `
      <div class="window">
        <div class="tfa-overlay">
          ${topBlock({ progress: 0, pinned: { text: "Ship the payments hotfix", time: "0:41:12" } })}
          ${NOTE_ROWS.slice(0, 4).join("")}
          ${footer({ count: "0/4", total: "1:29:19" })}
        </div>
      </div>`,
  },
  {
    name: "emoji-status",
    width: 460,
    height: 340,
    body: `
      <div class="window">
        <div class="tfa-overlay">
          ${topBlock({ progress: 0 })}
          ${taskRow({ text: "Ship the payments hotfix", emoji: "🔵", time: "0:41:12", running: true })}
          ${emojiStrip()}
          ${taskRow({ text: "Review Anna's pull request", emoji: "🔜", time: "0:06:55" })}
          ${taskRow({ text: "Write the release notes", emoji: null, time: "" })}
        </div>
      </div>`,
  },
  {
    name: "breaks",
    width: 460,
    height: 270,
    body: `
      <div class="window">
        <div class="tfa-overlay">
          ${topBlock({ progress: 0 })}
          ${taskRow({ text: "Ship the payments hotfix", emoji: "🔵", time: "0:41:12" })}
          ${taskRow({ text: "Review Anna's pull request", emoji: "🔜", time: "0:06:55" })}
          ${footer({ count: "0/2", total: "0:48:07", breakTime: "0:04:31" })}
        </div>
      </div>`,
  },
  {
    name: "markdown-source",
    width: 700,
    height: 300,
    body: `
      <div class="source"><span class="dim"># Today</span>

- [ ] 🔵 Ship the payments hotfix ⏱️ 0:41:12
  - [ ] ✅ reproduce on staging ⏱️ 0:12:40
  - [ ] 🔄 patch the retry logic ⏱️ 0:28:32
- [ ] 🔜 Review Anna's pull request ⏱️ 0:06:55
- [x] ✅ Reply on Slack ⏱️ 0:04:18

☕ 0:22:10</div>`,
  },
];

function page(body) {
  return `<!doctype html>
<html><head><meta charset="utf-8"><style>${THEME}
${pluginStyles}</style></head>
<body>${body}</body></html>`;
}

rmSync(tmpDir, { recursive: true, force: true });
mkdirSync(tmpDir, { recursive: true });
mkdirSync(outDir, { recursive: true });

for (const shot of shots) {
  const htmlPath = join(tmpDir, `${shot.name}.html`);
  const pngPath = join(outDir, `${shot.name}.png`);
  writeFileSync(htmlPath, page(shot.body));

  execFileSync(
    CHROME,
    [
      "--headless=new",
      "--disable-gpu",
      "--hide-scrollbars",
      `--force-device-scale-factor=${SCALE}`,
      `--window-size=${shot.width},${shot.height}`,
      `--screenshot=${pngPath}`,
      "--virtual-time-budget=1500",
      `file://${htmlPath}`,
    ],
    { stdio: "ignore" },
  );

  console.log(`${shot.name}.png  ${shot.width * SCALE}×${shot.height * SCALE}`);
}

rmSync(tmpDir, { recursive: true, force: true });
console.log("\nDone. Screenshots written to docs/screenshots/");
