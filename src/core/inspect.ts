import { execFileSync, execSync } from 'child_process';
import { readFileSync, readlinkSync, lstatSync, realpathSync } from 'fs';
import { getProcessName, getCommandForPid, getCwdForPid, getStarttimeTicks } from './scanner';
import { readDevRegistry } from './wrapper';

export interface ProcessSecurity {
  pid: number;
  name: string | null;
  user: string | null;
  uid: number | null;
  exe: string | null;
  cwd?: string;
  command?: string;
  startedAt: string | null;
  threads: number | null;
  memoryKb: number | null;
}

export interface ConnectionInfo {
  proto: 'tcp' | 'udp';
  state: string;
  local: string;
  remote: string;
  pid: number | null;
  external: boolean;
}

export interface SecurityLogs {
  source: 'journalctl-pid' | 'journalctl-comm' | 'none';
  text: string;
}

function resolveUsername(uid: number): string {
  try {
    const passwd = readFileSync('/etc/passwd', 'utf8');
    for (const line of passwd.split('\n')) {
      const parts = line.split(':');
      if (parseInt(parts[2]) === uid) return parts[0];
    }
  } catch {}
  return String(uid);
}

function getBootTime(): number {
  try {
    const uptime = parseFloat(readFileSync('/proc/uptime', 'utf8').split(' ')[0]);
    return Date.now() / 1000 - uptime;
  } catch {
    return Date.now() / 1000;
  }
}

// ── Wall-clock start time of a PID — display only (see getStarttimeTicks in
// scanner.ts for the drift-safe identity check used to validate PID reuse,
// which stays independent of wall-clock time — WSL2's clock can drift after
// the host sleeps, which broke a naive ISO-timestamp comparison here). ─────
export function getProcessStartTime(pid: number): Date | null {
  const ticks = getStarttimeTicks(pid);
  if (ticks === null) return null;
  const hz = 100;
  return new Date((getBootTime() + ticks / hz) * 1000);
}

export function getProcessSecurity(pid: number): ProcessSecurity {
  const result: ProcessSecurity = {
    pid, name: getProcessName(pid), user: null, uid: null, exe: null,
    startedAt: null, threads: null, memoryKb: null,
  };

  try {
    const status = readFileSync(`/proc/${pid}/status`, 'utf8');
    const uidLine = status.match(/^Uid:\s+(\d+)/m);
    if (uidLine) {
      result.uid = parseInt(uidLine[1]);
      result.user = resolveUsername(result.uid);
    }
    const threads = status.match(/^Threads:\s+(\d+)/m);
    if (threads) result.threads = parseInt(threads[1]);
    const vmrss = status.match(/^VmRSS:\s+(\d+)/m);
    if (vmrss) result.memoryKb = parseInt(vmrss[1]);
  } catch {}

  try {
    result.exe = realpathSync(`/proc/${pid}/exe`);
  } catch {
    result.exe = null;
  }

  result.startedAt = getProcessStartTime(pid)?.toISOString() ?? null;

  result.command = getCommandForPid(pid);
  result.cwd = getCwdForPid(pid);

  return result;
}

// ── Loopback / private-range check so an unexpected public IP stands out ────
function isExternalAddress(addr: string): boolean {
  let host = addr;
  if (host.startsWith('[')) {
    host = host.substring(1, host.indexOf(']'));
  } else {
    const lastColon = host.lastIndexOf(':');
    const maybePort = lastColon !== -1 ? host.substring(lastColon + 1) : '';
    if (/^(\d+|\*)$/.test(maybePort)) host = host.substring(0, lastColon);
  }
  if (!host || host === '*' || host === '0.0.0.0' || host === '::') return false;
  if (host === '127.0.0.1' || host === '::1' || host === 'localhost') return false;
  if (/^127\./.test(host)) return false;
  if (/^10\./.test(host)) return false;
  if (/^192\.168\./.test(host)) return false;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(host)) return false;
  if (/^fe80:/i.test(host) || /^fc00:/i.test(host) || /^fd/i.test(host)) return false;
  return true;
}

export function getConnectionsForPort(port: number): ConnectionInfo[] {
  const results: ConnectionInfo[] = [];
  try {
    const out = execSync('ss -tunap 2>/dev/null', { encoding: 'utf8', timeout: 4000 });
    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      const cols = line.trim().split(/\s+/);
      if (cols.length < 5) continue;
      const hasNetid = /^(tcp|udp)/i.test(cols[0]);
      const stateIdx = hasNetid ? 1 : 0;
      const localIdx = hasNetid ? 4 : 3;
      const remoteIdx = localIdx + 1;
      const local = cols[localIdx];
      const remote = cols[remoteIdx];
      if (!local || !remote) continue;

      const localPort = parseInt(local.substring(local.lastIndexOf(':') + 1));
      const remotePort = parseInt(remote.substring(remote.lastIndexOf(':') + 1) || '0');
      if (localPort !== port && remotePort !== port) continue;

      const proc = cols.slice(remoteIdx + 1).join(' ');
      const pidM = proc.match(/pid=(\d+)/);

      results.push({
        proto: /^udp/i.test(cols[0] ?? '') ? 'udp' : 'tcp',
        state: hasNetid ? cols[stateIdx] : 'UNCONN',
        local, remote,
        pid: pidM ? parseInt(pidM[1]) : null,
        external: isExternalAddress(remote),
      });
    }
  } catch {}
  return results;
}

export function getSecurityLogs(pid: number, comm: string | null, lines = 100): SecurityLogs {
  try {
    const text = execFileSync('journalctl', [`_PID=${pid}`, '-n', String(lines), '--no-pager', '-o', 'short-iso'], {
      encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    if (text) return { source: 'journalctl-pid', text };
  } catch {}

  if (comm) {
    try {
      const text = execFileSync('journalctl', [`_COMM=${comm}`, '-n', String(lines), '--no-pager', '-o', 'short-iso'], {
        encoding: 'utf8', timeout: 4000, stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
      if (text) return { source: 'journalctl-comm', text };
    } catch {}
  }

  return { source: 'none', text: '' };
}

// ── Resolve a real, independently-tailable log file for a host process ──────
// Most hand-run dev servers (`npm run dev`, a bare `node server.js`, …) never
// touch journald — their stdout/stderr go straight to whichever terminal or
// redirect target launched them. journalctl -f is therefore silent for them
// even though nothing is wrong, and a pty can't be safely snooped by a second
// reader (it would steal bytes from the real terminal). Two ways out:
//
// 1. The process was launched via `portmaster dev -- <command>` — the CLI
//    wrapper tees output to a known file and registers pid → path on disk
//    (dev processes run as a separate CLI invocation, not inside the
//    dashboard's own process, so this is the only way to discover them).
// 2. fd 1/2 happen to point at a real *regular* file anyway (e.g. started
//    with `... > out.log 2>&1 &`) — tail that directly.
export function resolveHostLogPath(pid: number): string | null {
  const reg = readDevRegistry()[String(pid)];
  if (reg && reg.starttimeTicks != null) {
    // Same PID could since have been reused by an unrelated process — only
    // trust the registry entry if the process's boot-relative start tick
    // still matches exactly (unlike a wall-clock timestamp, this can't be
    // thrown off by clock drift between the wrapper's and our own reading).
    const actualTicks = getStarttimeTicks(pid);
    if (actualTicks != null && actualTicks === reg.starttimeTicks) {
      try { if (lstatSync(reg.path).isFile()) return reg.path; } catch {}
    }
  }

  for (const fd of [1, 2]) {
    try {
      const target = readlinkSync(`/proc/${pid}/fd/${fd}`);
      if (!target.startsWith('/') || target.startsWith('/dev/') || target.startsWith('pipe:') || target.startsWith('socket:')) continue;
      if (lstatSync(target).isFile()) return target;
    } catch {}
  }
  return null;
}
