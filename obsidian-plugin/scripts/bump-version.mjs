// Bump the plugin version everywhere it must stay in sync:
//   obsidian-plugin/manifest.json, obsidian-plugin/package.json,
//   <repo root>/manifest.json, <repo root>/versions.json
// Usage: npm run bump 0.2.0
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: npm run bump <x.y.z>  (no 'v' prefix — Obsidian requirement)");
  process.exit(1);
}

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const repoRoot = resolve(pluginDir, "..");

function updateJson(path, mutate) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  const updated = mutate(data);
  writeFileSync(path, JSON.stringify(updated, null, 2) + "\n");
  console.log(`updated ${path}`);
}

const manifestPath = join(pluginDir, "manifest.json");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));

updateJson(manifestPath, (data) => ({ ...data, version }));
updateJson(join(pluginDir, "package.json"), (data) => ({ ...data, version }));
updateJson(join(repoRoot, "manifest.json"), (data) => ({ ...data, version }));
updateJson(join(repoRoot, "versions.json"), (data) => ({
  ...data,
  [version]: manifest.minAppVersion,
}));

console.log(`\nNow commit, then: git tag ${version} && git push origin ${version}`);
