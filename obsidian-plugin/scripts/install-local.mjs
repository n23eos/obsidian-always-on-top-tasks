// Симлинк папки плагина в vault для живой отладки.
// Путь к vault: из переменной VAULT_PATH или из .env (VAULT_PATH=...).
import { existsSync, readFileSync, symlinkSync, rmSync, mkdirSync } from "fs";
import { resolve, dirname, join } from "path";
import { fileURLToPath } from "url";

const pluginDir = resolve(dirname(fileURLToPath(import.meta.url)), "..");

function readVaultPath() {
  if (process.env.VAULT_PATH) return process.env.VAULT_PATH;
  const envFile = join(pluginDir, ".env");
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

const pluginsDir = join(vaultPath, ".obsidian", "plugins");
const linkPath = join(pluginsDir, "tasks-for-focus-adhd");

mkdirSync(pluginsDir, { recursive: true });
if (existsSync(linkPath)) rmSync(linkPath, { recursive: true });
symlinkSync(pluginDir, linkPath, "dir");
console.log(`Linked ${linkPath} -> ${pluginDir}`);
