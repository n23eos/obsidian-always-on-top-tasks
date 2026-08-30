# Tasks for Focus ADHD

An Obsidian plugin that pins a note **on top of every window** at the edge of
your screen — an attention anchor against ADHD context-switching. Each task
line gets a per-task **stopwatch** and an **emoji status**, all stored right in
the markdown.

## Why

With ADHD, the task you are working on evaporates the moment another window
covers it. This plugin keeps one chosen note — your "now" list — permanently
visible: compact, semi-transparent, docked to the screen edge, above
fullscreen apps too.

## Features

- **Always-on-top overlay** — a popout window pinned above all apps
  (including fullscreen), docked left or right, adjustable width and opacity
- **Per-task stopwatch** — click ▶, work, click ⏹: time is appended to the
  task line as `⏱️ H:MM:SS`. Sessions accumulate to the second
- **One timer at a time** — starting a new timer stops the previous one;
  that's the whole point of focus
- **Emoji status** — one click opens an inline palette:
  ⬜ 🔄 ⏸️ 🔜 ⛔ ✅ ❗ 🔴 🟠 🟡 🟢 🔵 🟣
- **Checkbox integration** — checking a task sets ✅ and stops its timer
- **Honest data** — everything lives in the note itself:

```
- [ ] 🔵 Fix auth bug ⏱️ 0:01:23
- [x] ✅ Reply on Slack ⏱️ 0:00:14
```

  No hidden databases. The note stays a plain markdown file, fully readable
  in vanilla Obsidian or any editor.

- **Never lies about time** — a running timer survives Obsidian restarts;
  a session longer than 2 hours is written with a "looks like you forgot the
  timer" warning; if the task line was renamed or duplicated while the timer
  ran, you get a notice with the session duration instead of a silent
  wrong-line write.

## Commands

| Command | Action |
|---|---|
| **Open current note as focus overlay** | Pin the active note (path is remembered) |
| **Toggle focus overlay** | Show/hide the overlay — bind it to a hotkey |

## Installation

Not in the Community Plugins catalog yet — install manually:

```bash
git clone https://github.com/n23eos/simple-focus-adhd
cd simple-focus-adhd/obsidian-plugin
npm install
npm run build
```

Then copy `manifest.json`, `main.js`, `styles.css` into
`<your vault>/.obsidian/plugins/tasks-for-focus-adhd/` and enable the plugin
in **Settings → Community plugins**.

For development, put `VAULT_PATH=/path/to/vault` into `.env` and run
`npm run install-local` — it symlinks the plugin folder into your vault.

## Settings

- Note to pin, screen edge (left/right), overlay width, opacity
- Emoji status button can be hidden (status stays visible as text)
- Experimental: click-through mode, non-focusable window

## Platform limitations

- **Desktop only** — the overlay needs Electron APIs, unavailable on mobile.
- **Clicking the overlay activates Obsidian** — Electron has no equivalent of
  macOS non-activating panels. Focus is released right after each button
  click, but one focus switch is unavoidable.
- Linux/Wayland: always-on-top depends on your window manager.
- Uses Electron APIs that are not part of the public Obsidian plugin API;
  if they break in a future Obsidian version, the plugin degrades gracefully
  to a regular (non-pinned) window.

## How it works

```
src/core/           pure logic, no Obsidian imports (vitest-covered)
  taskLine.ts       task line parser/serializer (emoji, elapsed time)
  timer.ts          timer sessions, line addressing (lineNo + exact text)
src/electron.ts     BrowserWindow access: always-on-top, geometry (try/catch)
src/TimerService.ts the single running timer, atomic writes via vault.process
src/overlay/        popout window controller + the overlay view
```

The `@electron/remote` runtime resolver is adapted from
[obsidian-synaptic-hatch](https://github.com/especialkim/obsidian-synaptic-hatch) (MIT).

## Development

```bash
npm run dev    # watch build
npm test       # vitest (unit tests for the pure core)
```

## License

[MIT](../LICENSE)
