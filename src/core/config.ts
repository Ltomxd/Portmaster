import { mkdirSync, readFileSync, writeFileSync, realpathSync, statSync } from 'fs';
import { join } from 'path';
import { homedir } from 'os';

const CONFIG_DIR = join(homedir(), '.portmaster');
const CONFIG_PATH = join(CONFIG_DIR, 'config.json');

export interface PortmasterConfig {
  projectsRoot: string | null;
}

const DEFAULT_CONFIG: PortmasterConfig = { projectsRoot: null };

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
