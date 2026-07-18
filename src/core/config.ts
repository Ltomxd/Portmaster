import { mkdirSync, readFileSync, writeFileSync, realpathSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { randomBytes, scryptSync, timingSafeEqual } from 'crypto';

const CONFIG_DIR = join(homedir(), '.portmaster');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export interface SavedCommand {
  label: string;
  cmd: string;
}

export interface PortmasterConfig {
  projectsRoot: string | null;
  favoritePorts: number[];
  favoriteProjects: string[];
  savedCommands: Record<string, SavedCommand[]>;
  authPasswordHash: string | null; // "salt:hash" hex — null means auth is disabled
}

const DEFAULT_CONFIG: PortmasterConfig = {
  projectsRoot: null,
  favoritePorts: [],
  favoriteProjects: [],
  savedCommands: {},
  authPasswordHash: null,
};

function ensureConfigDir(): void {
  try { mkdirSync(CONFIG_DIR, { recursive: true }); } catch {}
}

export function getConfig(): PortmasterConfig {
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_PATH, 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

function writeConfig(config: PortmasterConfig): void {
  ensureConfigDir();
  writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2));
}

// Persists across dashboard restarts — this is the whole point of the
// Projects tab's saved root: set it once, it's there every time.
export function setProjectsRoot(path: string): { success: boolean; path?: string; error?: string } {
  let real: string;
  try {
    real = realpathSync(path);
  } catch {
    return { success: false, error: `Path does not exist: ${path}` };
  }
  try {
    if (!statSync(real).isDirectory()) return { success: false, error: `Not a directory: ${real}` };
  } catch {
    return { success: false, error: `Cannot read path: ${real}` };
  }
  const config = getConfig();
  config.projectsRoot = real;
  writeConfig(config);
  return { success: true, path: real };
}

export function toggleFavoritePort(port: number): number[] {
  const config = getConfig();
  const set = new Set(config.favoritePorts);
  if (set.has(port)) set.delete(port); else set.add(port);
  config.favoritePorts = [...set].sort((a, b) => a - b);
  writeConfig(config);
  return config.favoritePorts;
}

export function toggleFavoriteProject(relPath: string): string[] {
  const config = getConfig();
  const set = new Set(config.favoriteProjects);
  if (set.has(relPath)) set.delete(relPath); else set.add(relPath);
  config.favoriteProjects = [...set];
  writeConfig(config);
  return config.favoriteProjects;
}

export function getSavedCommands(relPath: string): SavedCommand[] {
  return getConfig().savedCommands[relPath] ?? [];
}

export function addSavedCommand(relPath: string, cmd: SavedCommand): SavedCommand[] {
  const config = getConfig();
  const list = [...(config.savedCommands[relPath] ?? []), cmd];
  config.savedCommands = { ...config.savedCommands, [relPath]: list };
  writeConfig(config);
  return list;
}

export function removeSavedCommand(relPath: string, index: number): SavedCommand[] {
  const config = getConfig();
  const list = (config.savedCommands[relPath] ?? []).filter((_, i) => i !== index);
  config.savedCommands = { ...config.savedCommands, [relPath]: list };
  writeConfig(config);
  return list;
}

export function replaceConfig(next: Partial<PortmasterConfig>): PortmasterConfig {
  const merged: PortmasterConfig = { ...DEFAULT_CONFIG, ...next };
  writeConfig(merged);
  return merged;
}

// Off by default — this is a local dev dashboard, not a public service. An
// explicit password is opt-in and only matters if it's ever reachable
// beyond localhost (which WSL's 0.0.0.0 bind makes easy to do by accident).
export function isAuthEnabled(): boolean {
  return !!getConfig().authPasswordHash;
}

export function setDashboardPassword(password: string | null): void {
  const config = getConfig();
  if (!password) {
    config.authPasswordHash = null;
  } else {
    const salt = randomBytes(16).toString('hex');
    const hash = scryptSync(password, salt, 64).toString('hex');
    config.authPasswordHash = `${salt}:${hash}`;
  }
  writeConfig(config);
}

export function verifyDashboardPassword(password: string): boolean {
  const { authPasswordHash } = getConfig();
  if (!authPasswordHash) return false;
  const [salt, hash] = authPasswordHash.split(':');
  if (!salt || !hash) return false;
  const check = scryptSync(password, salt, 64);
  const stored = Buffer.from(hash, 'hex');
  return check.length === stored.length && timingSafeEqual(check, stored);
}
