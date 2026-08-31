// Bump the plugin version everywhere it must stay in sync:
//   manifest.json, package.json, versions.json
// Usage: npm run bump 0.5.0
import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? "")) {
  console.error("Usage: npm run bump <x.y.z>  (no 'v' prefix — Obsidian requirement)");
  process.exit(1);
}

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function updateJson(path, mutate) {
  const data = JSON.parse(readFileSync(path, "utf8"));
  writeFileSync(path, JSON.stringify(mutate(data), null, 2) + "\n");
  console.log(`updated ${path}`);
}

const manifestPath = join(repoRoot, "manifest.json");
const { minAppVersion } = JSON.parse(readFileSync(manifestPath, "utf8"));

updateJson(manifestPath, (data) => ({ ...data, version }));
updateJson(join(repoRoot, "package.json"), (data) => ({ ...data, version }));
// versions.json tells Obsidian which plugin version an older app may install.
updateJson(join(repoRoot, "versions.json"), (data) => ({ ...data, [version]: minAppVersion }));

console.log(`\nNow commit, then: git tag ${version} && git push origin ${version}`);
