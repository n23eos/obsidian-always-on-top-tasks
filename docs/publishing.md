# Releasing to the Obsidian Community Plugins catalog

The catalog entry already exists and is owned by this account, so a new version
is just a new tag — no pull request to `obsidian-releases` is needed any more.

## Repository layout

The repository root **is** the plugin root: `manifest.json`, `versions.json`,
`package.json`, `tsconfig.json`, `styles.css`, `src/` and `tests/` all live at
the top level, the way the catalog's review tooling expects. The standalone
macOS app sits in `macos/` and is unrelated to the plugin build.

This matters: while the plugin lived in a subdirectory, the review's linter
could not resolve the `obsidian` package and reported several hundred bogus
`@typescript-eslint/no-unsafe-*` warnings — every `TFile`, `WorkspaceLeaf` and
`Setting` call site. `npm run lint` locally reproduces exactly what the review
runs, so check it before tagging.

## Cutting a release

```bash
npm run lint                # the same typed rules the review uses
npm test
npm run bump 0.5.0          # manifest.json, package.json, versions.json
git commit -am "chore: release 0.5.0"
git tag 0.5.0               # no "v" prefix — Obsidian requirement
git push origin main 0.5.0
```

GitHub Actions lints, tests, builds, attests the artifacts and attaches exactly
three assets to the release — `main.js`, `manifest.json`, `styles.css` — as
individual files at the top level, not inside a zip.

```bash
gh release view 0.5.0 --json assets --jq '.assets[].name'
gh attestation verify main.js --repo n23eos/obsidian-always-on-top-tasks
```

## What this repository satisfies

| Requirement | Where |
|---|---|
| `manifest.json` and `versions.json` at the repository root | root; a single copy, no duplicate to keep in sync |
| Release tag without a `v` prefix | `.github/workflows/release.yml` only triggers on `x.y.z` |
| Three loose release assets | same workflow |
| Build provenance attestations | `actions/attest-build-provenance` in the same workflow |
| `isDesktopOnly: true` | the overlay needs Electron window APIs |
| A license file | `LICENSE`, MIT |
| A README that explains the plugin | root `README.md` |
| Typed lint clean | `npm run lint`, enforced in CI before the release is cut |
| Declarative settings, searchable in Obsidian | `getSettingDefinitions()` in `src/SettingsTab.ts` |
| No `leaf.detach()` in `onunload` | `onunload` only releases always-on-top |
| No inline styles set from JavaScript | indentation goes through the `--tfa-indent` CSS variable |
| English UI in sentence case | all settings, notices and button labels |
| Plugin name absent from command names | "Toggle focus overlay", "Open current note as focus overlay" |

## Version floor

`minAppVersion` is `1.13.0` because the settings tab uses the declarative
settings API introduced in that release. Users on older Obsidian keep getting
0.4.0 — that is exactly what `versions.json` is for, so never rewrite its
older entries.

## The question a reviewer will ask

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

## Frozen forever

The plugin `id` is `tasks-for-focus-adhd`, even though the display name is
"Always-on-Top Tasks". Changing it would orphan every existing installation.
