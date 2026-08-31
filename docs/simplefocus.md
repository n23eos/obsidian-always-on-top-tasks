# SimpleFocus (macOS app)

A minimal "attention anchor": a floating panel above all windows that always
shows what you are doing right now. Same idea as the
[Always-on-Top Tasks](../README.md) Obsidian plugin, but standalone — no
Obsidian required.

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

## Features

- Borderless always-on-top panel, visible on all Spaces
- Task tree up to 5 levels deep, drag & drop (moves whole subtree)
- Color markers (click the circle → palette)
- Completed root tasks stack on top, gray and fading
- Global hotkey **⌘⇧L** — add a task from any app
- Click-through mode (panel ignores the mouse), opacity control
- State persists between launches (JSON in UserDefaults)

## Build & run

```bash
cd macos
./build_app.sh
open dist/SimpleFocus.app
```

Requirements: macOS 14+, Xcode Command Line Tools. Tests: `swift test` from
`macos/`.

## Architecture

```
macos/Sources/SimpleFocusCore/   pure logic, no AppKit (unit-tested, immutable)
macos/Sources/SimpleFocus/       the app: NSPanel (.floating, nonactivating),
                                 SwiftUI content, menu bar, Carbon hotkey
```

## Why this exists next to the plugin

SimpleFocus is a native `NSPanel` — it never steals keyboard focus from the app
you are working in. The Obsidian plugin lives where your notes live, but an
Electron window always activates on click (platform limitation). Choose your
trade-off, or run both.

## License

[MIT](../LICENSE)
