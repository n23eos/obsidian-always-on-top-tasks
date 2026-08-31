# Always-on-Top Tasks

An Obsidian plugin that pins one note **on top of every window** — a compact,
semi-transparent overlay docked to the edge of your screen, where every task
line gets a stopwatch and an emoji status. Everything is written back into the
markdown file itself.

## The problems this solves

**You lose the thread when several projects are open at once.** The moment a
browser, a terminal or a chat window covers your task list, the current task is
gone from your head too. The overlay stays above every other window, including
fullscreen apps, pinned to one half of the monitor — so what you are doing right
now never leaves your field of view.

**You do not know where the hours actually went.** Each task line has its own
stopwatch: press ▶, work, press ⏹. The elapsed time is appended to the line as
`⏱️ H:MM:SS`, sessions add up to the second, and only one timer can run at a
time — which is the entire point of focusing.

**Your time data is locked inside somebody else's app.** Here it is stored as
plain text inside your own vault, so anything that can read the vault can read
the numbers — including an AI agent. Ask Claude (or any assistant with access to
your notes) where last week went, and it can answer from the note itself. No
export, no API, no separate database.

**A flat checklist does not match the shape of real work.** Nested tasks keep
their markdown indentation in the overlay, and a one-click emoji palette marks
what is in progress, blocked, deferred or done — right in the line, readable in
any editor.

## What it looks like

![The overlay pinned above another window](docs/screenshots/overlay-pinned.png)

*The overlay is docked to the right edge and floats above whatever you are
working in. It never hides behind the window you switch to.*

![The pinned header showing the running task](docs/screenshots/running-task.png)

*While a timer runs, a sticky header keeps the current task and its ticking time
at the top, no matter how far the note is scrolled. The footer counts finished
tasks and the total time of the note.*

![The inline emoji status palette](docs/screenshots/emoji-status.png)

*One click on the status button opens an inline palette. The chosen emoji is
written into the task line, so the status is visible in plain Obsidian too.*

![The break stopwatch running in the footer](docs/screenshots/breaks.png)

*The optional ☕ button stops the task timer and starts a break stopwatch. Total
break time accumulates in the note, and a long work session gets a gentle
reminder instead of a forced pomodoro stop.*

![The same note as raw markdown](docs/screenshots/markdown-source.png)

*The same note in a normal editor. No hidden database, no sidecar files — which
is what makes the data readable by other tools and by AI agents.*

<sub>Screenshots are rendered from the plugin's own `styles.css` by
[`docs/screenshots/render.mjs`](docs/screenshots/render.mjs).</sub>

## Data format

A task line is ordinary markdown: a checkbox, an optional status emoji, the
text, and the accumulated time at the end.

```markdown
- [ ] 🔵 Ship the payments hotfix ⏱️ 0:41:12
  - [ ] ✅ reproduce on staging ⏱️ 0:12:40
- [x] ✅ Reply on Slack ⏱️ 0:04:18

☕ 0:22:10
```

Statuses: ⬜ not started · 🔄 in progress · ⏸️ paused · 🔜 deferred · ⛔ blocked ·
✅ done · ❗ important · 🔴 🟠 🟡 🟢 🔵 🟣 colour labels.

The plugin stores nothing else in the note — no ids, no metadata blocks. Its
`data.json` holds only your settings and the one running timer, so that a timer
survives an Obsidian restart.

## Installation

Requires Obsidian 1.13 or later, desktop only.

**Settings → Community plugins → Browse**, search for "Always-on-Top Tasks",
install and enable.

To install manually instead:

```bash
git clone https://github.com/n23eos/obsidian-always-on-top-tasks
cd obsidian-always-on-top-tasks
npm install
npm run build
```

Copy `manifest.json`, `main.js` and `styles.css` into
`<your vault>/.obsidian/plugins/tasks-for-focus-adhd/`, then enable the plugin in
**Settings → Community plugins**. Prebuilt files are also attached to every
[release](https://github.com/n23eos/obsidian-always-on-top-tasks/releases).

## Commands

| Command | What it does |
|---|---|
| **Open current note as focus overlay** | Pins the active note; the path is remembered for next time |
| **Toggle focus overlay** | Shows or hides the overlay — worth binding to a hotkey |

## Settings

Note to pin · screen edge (left or right) · overlay width · opacity · breaks and
the reminder threshold · whether the emoji button is shown. Two experimental
switches — click-through and never-take-focus — are off by default.

## Behaviour worth knowing

- **One timer at a time.** Starting a timer commits and stops the previous one.
- **Checking a task stops its timer** and writes the session first.
- **A running timer survives a restart** of Obsidian.
- **The plugin never loses time silently.** If the task line was renamed or
  duplicated while the timer ran, you get a notice with the exact session length
  instead of a wrong write. A session longer than two hours is committed with a
  "looks like the timer was left running" warning.
- **Editing is one click.** Click the task text to rename it in place; the
  footer has a field for adding new tasks.

## Platform limitations

- **Desktop only.** The overlay needs Electron window APIs, which mobile
  Obsidian does not have.
- **Obsidian 1.13 or later**, because the settings use the declarative settings
  API. Older versions can still install release 0.4.0.
- **Clicking the overlay activates Obsidian.** Electron has no equivalent of a
  macOS non-activating panel. Focus is released right after each button click,
  but that one focus switch is unavoidable.
- **Linux/Wayland:** whether a window can stay on top is up to your window
  manager.
- The always-on-top behaviour uses Electron APIs that are not part of the public
  Obsidian plugin API. Every call is guarded: if a future Obsidian version breaks
  them, the plugin degrades to a normal, unpinned window instead of failing.

## Development

```bash
npm install
npm run dev     # watch build
npm test        # vitest — unit tests for the pure core
npm run lint    # the same typed rules the catalog review runs
```

```
src/core/       pure logic, no Obsidian imports (fully unit-tested)
  taskLine.ts   task line parser and serializer (emoji, elapsed time)
  timer.ts      timer sessions, line addressing (line number + exact text)
  breakLine.ts  the "☕ H:MM:SS" total-break line
src/electron.ts BrowserWindow access: always-on-top, geometry (all guarded)
src/TimerService.ts  the single running timer, atomic writes via vault.process
src/overlay/    popout window controller and the overlay view
macos/          the standalone SimpleFocus app, unrelated to the plugin build
```

Put `VAULT_PATH=/path/to/vault` into `.env` and run `npm run install-local`:
it creates the plugin folder in your vault and symlinks `main.js`,
`manifest.json` and `styles.css` into it, so `npm run dev` reloads live.

## Attribution

The `@electron/remote` runtime resolver is adapted from
[obsidian-synaptic-hatch](https://github.com/especialkim/obsidian-synaptic-hatch)
(MIT).

## Also in this repository: SimpleFocus

A native macOS menu bar app with the same idea — a floating task panel above all
windows — but without Obsidian, and with a true non-activating panel that never
steals keyboard focus. See [docs/simplefocus.md](docs/simplefocus.md).

## License

[MIT](LICENSE)
