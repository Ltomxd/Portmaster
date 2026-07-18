import { spawn } from 'child_process';
import { mkdirSync, createWriteStream, writeFileSync, readFileSync, existsSync, statSync, type WriteStream } from 'fs';
import { join } from 'path';
import { homedir } from 'os';
import { getStarttimeTicks } from './scanner';

export const LOG_DIR = join(homedir(), '.portmaster', 'logs');
const REGISTRY_PATH = join(LOG_DIR, 'registry.json');
const MAX_LOG_BYTES = 10 * 1024 * 1024; // 10MB — truncate on new run if exceeded, not a rotating archive

export interface DevRegistryEntry {
  path: string;
  command: string;
  startedAt: string;      // display only
  starttimeTicks: number | null; // identity check — see getStarttimeTicks
}

function ensureLogDir(): void {
  try { mkdirSync(LOG_DIR, { recursive: true }); } catch {}
}

// Read by the dashboard (inspect.ts) to find a live-log file for a `portmaster
// dev`-launched process. Also used by the wrapper itself to register/unregister.
export function readDevRegistry(): Record<string, DevRegistryEntry> {
  try { return JSON.parse(readFileSync(REGISTRY_PATH, 'utf8')); } catch { return {}; }
}

function writeDevRegistry(reg: Record<string, DevRegistryEntry>): void {
  ensureLogDir();
  try { writeFileSync(REGISTRY_PATH, JSON.stringify(reg, null, 2)); } catch {}
}

function registerPid(pid: number, entry: DevRegistryEntry): void {
  const reg = readDevRegistry();
  reg[String(pid)] = entry;
  writeDevRegistry(reg);
}

function unregisterPid(pid: number): void {
  const reg = readDevRegistry();
  delete reg[String(pid)];
  writeDevRegistry(reg);
}

function slugify(s: string): string {
  return s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'process';
}

// `portmaster dev -- <command>` — runs <command> exactly as if you'd typed it
// yourself (same stdin, same live terminal output), while also teeing
// stdout/stderr into a file the dashboard can tail live. This exists because
// a process that writes straight to an interactive terminal can't be
// observed from outside (see resolveHostLogPath in inspect.ts) — the only
// way to get real live logs for a bare `pnpm run dev` is to be the one
// holding the pipe from the moment it starts, which this wrapper does.
export function runDev(commandParts: string[], name?: string): void {
  ensureLogDir();
  const command = commandParts.join(' ');
  const slug = slugify(name ?? commandParts.slice(0, 2).join('-'));
  const logPath = join(LOG_DIR, `${slug}.log`);

  try {
    if (existsSync(logPath) && statSync(logPath).size > MAX_LOG_BYTES) writeFileSync(logPath, '');
  } catch {}

  const logStream: WriteStream = createWriteStream(logPath, { flags: 'a' });
  logStream.write(`\n─── portmaster dev: ${command} — started ${new Date().toISOString()} ───\n`);

  // No shell:true — argv is spawned exactly as your own shell already split
  // it. Rejoining into one string and letting a shell re-tokenize it would
  // silently break any argument containing quotes, spaces, or `;`/`&&`.
  const child = spawn(commandParts[0], commandParts.slice(1), { stdio: ['inherit', 'pipe', 'pipe'] });

  const tee = (out: NodeJS.WritableStream, chunk: Buffer) => {
    out.write(chunk);
    logStream.write(chunk);
  };
  child.stdout?.on('data', (c: Buffer) => tee(process.stdout, c));
  child.stderr?.on('data', (c: Buffer) => tee(process.stderr, c));

  if (child.pid) registerPid(child.pid, { path: logPath, command, startedAt: new Date().toISOString(), starttimeTicks: getStarttimeTicks(child.pid) });

  const forward = (sig: NodeJS.Signals) => { if (child.pid) { try { process.kill(child.pid, sig); } catch {} } };
  process.on('SIGINT', () => forward('SIGINT'));
  process.on('SIGTERM', () => forward('SIGTERM'));

  child.on('error', (err: any) => {
    if (child.pid) unregisterPid(child.pid);
    logStream.end(`\n─── failed to start: ${err.message} ───\n`);
    console.error(`portmaster dev: failed to start "${command}": ${err.message}`);
    process.exit(1);
  });

  child.on('exit', (code, signal) => {
    if (child.pid) unregisterPid(child.pid);
    logStream.end(`\n─── exited (code ${code ?? '—'}, signal ${signal ?? '—'}) ───\n`, () => {
      process.exit(code ?? (signal ? 1 : 0));
    });
  });
}
