# Simple Focus for ADHD

Two small tools against multitasking and ADHD context-switching. Both keep your
**current task in front of your eyes, on top of every window** — pick the one
that fits your workflow, or use both.

| Tool | What it is | Best for |
|---|---|---|
| [**SimpleFocus**](#simplefocus-macos-app) | Native macOS menu bar app with a floating task panel | Standalone use, no Obsidian required |
| [**Always-on-Top Tasks: ADHD Focus Timer**](obsidian-plugin/) | Obsidian plugin: pins a note as an always-on-top overlay | Your tasks already live in Obsidian |

---

## SimpleFocus (macOS app)

A minimal "attention anchor": a floating panel above all windows that always
shows what you are doing right now.

```
  ✓ set up CI               ← completed: gray, fading with age
  ✓ reply on Slack             (max 5 shown; "+N more…" opens a popup)
  🟢 Fix auth bug           ← active tasks with a color marker
     ⚪ reproduce              ← subtasks up to 5 levels deep
        ⚪ collect logs
     ⚪ write a test
  🔵 Prepare release
  + task                       ← appears on hover
```

### Features

- Borderless always-on-top panel, visible on all Spaces
- Task tree up to 5 levels deep, drag & drop (moves whole subtree)
- Color markers (click the circle → palette)
- Completed root tasks stack on top, gray and fading
- Global hotkey **⌘⇧L** — add a task from any app
- Click-through mode (panel ignores the mouse), opacity control
- State persists between launches (JSON in UserDefaults)

### Build & run

```bash
./build_app.sh
open dist/SimpleFocus.app
```

Requirements: macOS 14+, Xcode Command Line Tools. Tests: `swift test`.

### Architecture

```
Sources/SimpleFocusCore/   pure logic, no AppKit (unit-tested, immutable model)
Sources/SimpleFocus/       the app: NSPanel (.floating, nonactivating),
                           SwiftUI content, menu bar, Carbon hotkey
```

---

## Always-on-Top Tasks: ADHD Focus Timer (Obsidian plugin)

Pins any note as a compact always-on-top overlay at the edge of your screen.
Every `- [ ]` task line gets a **stopwatch** and an **emoji status** button —
everything is written back into the markdown itself:

```
- [ ] 🔵 Fix auth bug ⏱️ 0:01:23
- [x] ✅ Reply on Slack ⏱️ 0:00:14
```

No hidden databases: the note stays a plain, readable markdown file.

See [obsidian-plugin/README.md](obsidian-plugin/README.md) for installation
and details.

---

## Why two tools?

SimpleFocus is a native `NSPanel` — it never steals keyboard focus from the app
you are working in. The Obsidian plugin lives where your notes live, but an
Electron window always activates on click (platform limitation). Choose your
trade-off.

## License

[MIT](LICENSE)
