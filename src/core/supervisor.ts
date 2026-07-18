import { spawn, ChildProcessByStdio } from 'child_process';
import type { Readable } from 'stream';
import { getPortInfo, getCommandArgv, getFullCwdForPid } from './scanner';
import { killPortInfo } from './killer';
import { stripAnsi } from './ansi';

export interface ManagedProcess {
  port: number;
  pid: number;
  command: string;
  cwd: string;
  startedAt: string;
  child: ChildProcessByStdio<null, Readable, Readable>;
  buffer: string[];
}

const MAX_BUFFER_LINES = 300;
const managedByPid = new Map<number, ManagedProcess>();

export interface AdoptResult {
  success: boolean;
  pid?: number;
  command?: string;
  error?: string;
}

// "Adopt" a port: kill whatever's listening on it, then relaunch the exact
// same command (captured fresh from /proc before the kill) ourselves, with
// stdio piped instead of inherited from a terminal — so from this point on
// its output streams live through the dashboard, the same way a Docker or
// PM2 process's does. This is the only way to get live logs for a process
// that's already running bare in a terminal: we have to become its parent.
export async function adoptPort(port: number): Promise<AdoptResult> {
  // Already managed (e.g. a stale UI still offering to adopt) — reuse it
  // rather than needlessly killing and relaunching an already-fine process.
  for (const rec of managedByPid.values()) {
    if (rec.port === port) return { success: true, pid: rec.pid, command: rec.command };
  }

  const info = getPortInfo(port);
  if (!info) return { success: false, error: 'Port not in use' };
  if (info.source !== 'linux' || !info.pid) return { success: false, error: 'Only host (Linux) processes with a known PID can be adopted' };

  const argv = getCommandArgv(info.pid);
  if (!argv) return { success: false, error: 'Could not read the full command for this process — cannot relaunch it safely' };
  const cwd = getFullCwdForPid(info.pid) ?? process.cwd();
  const command = argv.join(' ');

  const killRes = killPortInfo(port, info);
  if (!killRes.success) return { success: false, error: killRes.error ?? 'Could not stop the current process' };

  // Give the OS a moment to release the socket before rebinding.
  await new Promise(r => setTimeout(r, 350));

  return new Promise(resolve => {
    let child: ChildProcessByStdio<null, Readable, Readable>;
    try {
      child = spawn(argv[0], argv.slice(1), { cwd, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (e: any) {
      resolve({ success: false, error: e.message });
      return;
    }

    child.once('error', (err: any) => resolve({ success: false, error: err.message }));
    child.once('spawn', () => {
      const pid = child.pid!;
      const rec: ManagedProcess = { port, pid, command, cwd, startedAt: new Date().toISOString(), child, buffer: [] };
      const push = (chunk: Buffer) => {
        const lines = stripAnsi(chunk.toString('utf8')).split(/\r?\n/).filter(Boolean);
        rec.buffer.push(...lines);
        if (rec.buffer.length > MAX_BUFFER_LINES) rec.buffer.splice(0, rec.buffer.length - MAX_BUFFER_LINES);
      };
      child.stdout.on('data', push);
      child.stderr.on('data', push);
      child.on('exit', () => managedByPid.delete(pid));
      managedByPid.set(pid, rec);
      resolve({ success: true, pid, command });
    });
  });
}

export function getManagedProcess(pid: number): ManagedProcess | undefined {
  return managedByPid.get(pid);
}

// port → pid, so the dashboard can recognize an already-adopted process
// after a page reload and just reopen its logs instead of adopting again
// (which would needlessly kill and relaunch an already-fine process).
export function getManagedPortMap(): Record<number, number> {
  const map: Record<number, number> = {};
  for (const rec of managedByPid.values()) map[rec.port] = rec.pid;
  return map;
}
