# Submitting to the Obsidian Community Plugins catalog

Everything here is done by hand, once. The repository side is already prepared.

## 1. Ship a release first

The catalog will not accept a plugin without a matching release.

```bash
cd obsidian-plugin
npm run bump 0.4.0          # updates both manifests, package.json, versions.json
cd ..
git commit -am "chore: release 0.4.0"
git tag 0.4.0               # no "v" prefix — Obsidian requirement
git push origin main 0.4.0
```

GitHub Actions builds the release and attaches exactly three assets to it:
`main.js`, `manifest.json`, `styles.css` — as individual files at the top level
of the release, not inside a zip. Verify:

```bash
gh release view 0.4.0 --json assets --jq '.assets[].name'
```

## 2. Open the pull request

1. Fork [obsidianmd/obsidian-releases](https://github.com/obsidianmd/obsidian-releases).
2. Add this entry to the **end** of the array in `community-plugins.json`:

```json
{
  "id": "tasks-for-focus-adhd",
  "name": "Always-on-Top Tasks",
  "author": "n23eos",
  "description": "Pin a note as an always-on-top focus overlay with per-task stopwatch and emoji status.",
  "repo": "n23eos/obsidian-always-on-top-tasks"
}
```

3. Open a PR against `master`. Use their template and tick the checkboxes
   honestly — the `id`, `name`, `author` and `description` must match
   `manifest.json` exactly, and `repo` is `owner/name`, not a URL.
4. A bot runs automated checks within minutes. Fix whatever it reports and push
   to the same branch; do not open a second PR.

## 3. What this repository already satisfies

| Requirement | Where |
|---|---|
| `manifest.json` at the repository root | root, byte-identical to the plugin copy (CI enforces it) |
| `versions.json` at the repository root | maps every version to its `minAppVersion` |
| Release tag without a `v` prefix | `.github/workflows/release.yml` only triggers on `x.y.z` |
| Three loose release assets | same workflow |
| `isDesktopOnly: true` | the overlay needs Electron window APIs |
| A license file | `LICENSE`, MIT |
| A README that explains the plugin | root `README.md` |
| No `innerHTML`, no `console.log`, no `as any` | checked before submission |
| No `leaf.detach()` in `onunload` | `onunload` only releases always-on-top |
| No inline styles set from JavaScript | indentation goes through the `--tfa-indent` CSS variable |
| `normalizePath` on user-entered paths | `SettingsTab.ts` |
| English UI in sentence case | all settings, notices and button labels |
| Plugin name absent from command names | "Toggle focus overlay", "Open current note as focus overlay" |

## 4. The question the reviewer will ask

**The plugin uses Electron APIs that are not part of the public Obsidian plugin
API** — `BrowserWindow.setAlwaysOnTop`, `setBounds`, `setOpacity`,
`setVisibleOnAllWorkspaces`. This is not incidental; it is the entire feature.
There is no supported Obsidian API for pinning a popout window above other
applications.

The honest answer, already reflected in the code and the README:

- The `@electron/remote` module is resolved at runtime, never bundled, and every
  call site is wrapped in `try`/`catch` (`src/electron.ts`).
- If resolution or any call fails, the user gets a notice and the plugin keeps
  working as an ordinary popout window — it does not throw and does not break
  the workspace.
- `isDesktopOnly: true`, so mobile is never affected.
- The platform limitations are documented in the README rather than hidden.

If the reviewer asks for the feature to be removed, there is nothing left of the
plugin, so the realistic outcomes are: accepted as is, or accepted after
tightening the guards. Be ready to point at `src/electron.ts` line by line.

## 5. After acceptance

- The catalog serves the **root** `manifest.json`; Obsidian downloads assets from
  the GitHub release. Both must stay in sync — `npm run bump` plus the CI check
  in `release.yml` handle that.
- Every later version is just a new tag: bump, commit, tag, push. No further PR
  to `obsidian-releases` is needed.
- The plugin `id` (`tasks-for-focus-adhd`) is frozen after acceptance, even
  though the display name is "Always-on-Top Tasks". Do not change it.
