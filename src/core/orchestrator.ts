import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync, spawn, ChildProcess } from 'child_process';
import * as yaml from 'js-yaml';
import { resolve, join } from 'path';

export interface ServiceConfig {
  command: string;
  port?: number;
  dir?: string;
  env?: Record<string, string>;
  depends_on?: string[];
  startup_delay?: number;
  healthcheck?: string;
  restart?: 'always' | 'on-failure' | 'never';
}

export interface OrchestratorConfig {
  version?: string;
  env?: Record<string, string>;
  services: Record<string, ServiceConfig>;
}

export interface ServiceState {
  name: string;
  status: 'running' | 'stopped' | 'starting' | 'error' | 'unknown';
  pid?: number;
  startedAt?: string;
  error?: string;
  config: ServiceConfig;
}

const DEFAULT_CONFIG_FILE = '.portmaster.yaml';
const runningServices = new Map<string, { process: ChildProcess; state: ServiceState }>();

export function loadConfig(configPath?: string): OrchestratorConfig {
  const file = configPath ?? join(process.cwd(), DEFAULT_CONFIG_FILE);
  if (!existsSync(file)) {
    throw new Error(`Config file not found: ${file}`);
  }
  const raw = readFileSync(file, 'utf8');
  return yaml.load(raw) as OrchestratorConfig;
}

export function initConfig(outputPath?: string): string {
  const file = outputPath ?? join(process.cwd(), DEFAULT_CONFIG_FILE);
  const template = `version: "1"

# Global environment variables
env:
  NODE_ENV: development

services:
  frontend:
    command: npm run dev
    port: 3000
    dir: ./frontend
    startup_delay: 2
    env:
      PORT: "3000"

  backend:
    command: npm run start:dev
    port: 8000
    dir: ./backend
    depends_on:
      - database
    env:
      PORT: "8000"

  # Example: Docker database
  # database:
  #   command: docker compose up -d db
  #   port: 5432
  #   startup_delay: 5
`;
  writeFileSync(file, template, 'utf8');
  return file;
}

function topologicalSort(services: Record<string, ServiceConfig>): string[] {
  const sorted: string[] = [];
  const visited = new Set<string>();
  const visiting = new Set<string>();

  function visit(name: string) {
    if (visiting.has(name)) throw new Error(`Circular dependency detected at: ${name}`);
    if (visited.has(name)) return;
    visiting.add(name);
    for (const dep of services[name]?.depends_on ?? []) {
      if (services[dep]) visit(dep);
    }
    visiting.delete(name);
    visited.add(name);
    sorted.push(name);
  }

  for (const name of Object.keys(services)) visit(name);
  return sorted;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

export async function startServices(
  config: OrchestratorConfig,
  serviceNames?: string[],
  onUpdate?: (name: string, state: ServiceState) => void
): Promise<void> {
  const order = topologicalSort(config.services);
  const toStart = serviceNames
    ? order.filter(n => serviceNames.includes(n))
    : order;

  const globalEnv = { ...process.env, ...config.env };

  for (const name of toStart) {
    const svc = config.services[name];
    if (!svc) continue;

    const state: ServiceState = {
      name,
      status: 'starting',
      startedAt: new Date().toISOString(),
      config: svc,
    };

    runningServices.set(name, { process: null as any, state });
    onUpdate?.(name, state);

    const cwd = svc.dir ? resolve(process.cwd(), svc.dir) : process.cwd();
    const env = { ...globalEnv, ...svc.env } as NodeJS.ProcessEnv;

    const parts = svc.command.split(' ');
    const child = spawn(parts[0], parts.slice(1), {
      cwd,
      env,
      detached: false,
      stdio: 'pipe',
    });

    state.pid = child.pid;
    state.status = 'running';
    runningServices.set(name, { process: child, state });

    child.on('error', (err) => {
      state.status = 'error';
      state.error = err.message;
      onUpdate?.(name, state);
    });

    child.on('exit', (code) => {
      if (state.status === 'running') {
        state.status = code === 0 ? 'stopped' : 'error';
        onUpdate?.(name, state);
      }
    });

    onUpdate?.(name, state);

    if (svc.startup_delay) {
      await sleep(svc.startup_delay * 1000);
    }
  }
}

export function stopServices(serviceNames?: string[]): void {
  const toStop = serviceNames ?? Array.from(runningServices.keys());
  for (const name of toStop.reverse()) {
    const entry = runningServices.get(name);
    if (entry) {
      try {
        entry.process.kill('SIGTERM');
        entry.state.status = 'stopped';
      } catch {}
      runningServices.delete(name);
    }
  }
}

export function getServiceStatus(): ServiceState[] {
  return Array.from(runningServices.values()).map(e => e.state);
}

export function restartService(name: string, config: OrchestratorConfig): void {
  stopServices([name]);
  startServices(config, [name]);
}
