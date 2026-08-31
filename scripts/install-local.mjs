// Ставит плагин в vault для живой отладки.
// Путь к vault: из переменной VAULT_PATH или из .env (VAULT_PATH=...).
//
// В vault создаётся настоящая папка, а внутрь симлинкуются три файла плагина.
// Симлинковать корень репозитория нельзя: в vault уехали бы .git, macos/, docs/
// и node_modules. При этом `npm run dev` по-прежнему обновляет плагин на лету —
// esbuild перезаписывает main.js, на который смотрит симлинк.
import { existsSync, lstatSync, readFileSync, symlinkSync, rmSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const PLUGIN_FILES = ["main.js", "manifest.json", "styles.css"];

function readVaultPath() {
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;
  const envFile = join(repoRoot, ".env");
  if (existsSync(envFile)) {
    const match = readFileSync(envFile, "utf8").match(/^VAULT_PATH=(.+)$/m);
    if (match) return match[1].trim();
  }
  return null;
}

const vaultPath = readVaultPath();
if (!vaultPath || !existsSync(join(vaultPath, ".obsidian"))) {
  console.error("Vault not found. Set VAULT_PATH env var or put VAULT_PATH=... into .env");
  process.exit(1);
}

if (!existsSync(join(repoRoot, "main.js"))) {
  console.error("main.js is missing — run `npm run build` (or `npm run dev`) first.");
  process.exit(1);
}

const { id } = JSON.parse(readFileSync(join(repoRoot, "manifest.json"), "utf8"));
const targetDir = join(vaultPath, ".obsidian", "plugins", id);

// Раньше сюда клали симлинк на всю папку плагина. Он остался (и теперь битый) —
// сносим, чтобы на его месте появилась настоящая папка. Настоящую папку с
// data.json не трогаем.
try {
  if (lstatSync(targetDir).isSymbolicLink()) rmSync(targetDir, { force: true });
} catch {
  // папки ещё нет — создадим ниже
}

mkdirSync(targetDir, { recursive: true });

for (const file of PLUGIN_FILES) {
  const linkPath = join(targetDir, file);
  // force: true убирает и битые симлинки (existsSync по ним врёт — идёт по ссылке)
  rmSync(linkPath, { recursive: true, force: true });
  symlinkSync(join(repoRoot, file), linkPath, "file");
}

console.log(`Linked ${PLUGIN_FILES.join(", ")} into ${targetDir}`);
console.log("data.json in the vault is left untouched — your settings survive.");
