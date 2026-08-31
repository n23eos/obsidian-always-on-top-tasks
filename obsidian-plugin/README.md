# Always-on-Top Tasks

Source of the Obsidian plugin. The full documentation — what it solves,
screenshots, installation, data format and platform limitations — lives in the
[repository README](../README.md), so there is only one text to keep correct.

```bash
npm install
npm run dev            # watch build
npm test               # vitest — unit tests for the pure core
npm run build          # production main.js
npm run install-local  # symlink into the vault from VAULT_PATH in .env
npm run bump 0.4.1     # sync the version across both manifests and versions.json
```

```
src/core/       pure logic, no Obsidian imports (fully unit-tested)
src/electron.ts BrowserWindow access: always-on-top, geometry (all guarded)
src/TimerService.ts  the single running timer, atomic writes via vault.process
src/overlay/    popout window controller and the overlay view
```

`manifest.json` here must stay byte-identical to the one in the repository root:
the community catalog reads the root copy, Obsidian installs this one from the
release. `npm run bump` keeps the versions in sync and CI fails the release if
the two files differ.

## License

[MIT](../LICENSE)
