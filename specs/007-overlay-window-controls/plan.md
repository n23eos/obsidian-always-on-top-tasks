# Plan

Use existing ItemView, settings definitions and Electron geometry. Expand the top
block to the view edges and exclude interactive elements from dragging. Store a
boolean privacy flag in view state; replace content synchronously and invalidate
pending renders. Add docked height with validation and display clamping.

Verify unit regressions, check/lint/build, browser UI, actual installed Obsidian
geometry and visibility lifecycle. Prepare 0.10.0 with English release notes.
