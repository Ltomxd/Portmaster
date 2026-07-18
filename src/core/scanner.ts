import { readFileSync, readdirSync, readlinkSync, realpathSync } from 'fs';
import { getWindowsPorts, detectWsl } from './wsl';

export interface PortInfo {
  port: number;
  pid: number | null;
  process: string | null;
  protocol: 'TCP' | 'UDP';
  state: string;
  address: string;
  source: 'linux' | 'windows';
  command?: string;
  cwd?: string;
  cpuPercent?: number;
  memoryMB?: number;
}

// Linux's USER_HZ is 100 on effectively every real system (x86/arm, glibc)
// — there's no portable syscall-free way to read it, so this is the same
// assumption /proc-reading tools like `top` and `ps` make in practice.
const CLK_TCK = 100;

// utime+stime deltas need a previous reading to turn into a rate — cached
// per PID across scanPorts() calls (the dashboard polls every few seconds,
// so consecutive calls land far enough apart for a meaningful delta).
const cpuCache = new Map<number, { ticks: number; time: number }>();

export function getProcessStats(pid: number): { cpuPercent: number; memoryMB: number } | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const afterComm = stat.substring(stat.lastIndexOf(')') + 2).split(' ');
    const utime = parseInt(afterComm[11]); // field 14
    const stime = parseInt(afterComm[12]); // field 15
    const totalTicks = utime + stime;
    const now = Date.now();

    let cpuPercent = 0;
    const prev = cpuCache.get(pid);
    if (prev) {
      const elapsedSec = (now - prev.time) / 1000;
      if (elapsedSec > 0.1) cpuPercent = Math.max(0, ((totalTicks - prev.ticks) / CLK_TCK) / elapsedSec * 100);
    }
    cpuCache.set(pid, { ticks: totalTicks, time: now });

    let memoryMB = 0;
    try {
      const m = readFileSync(`/proc/${pid}/status`, 'utf8').match(/VmRSS:\s+(\d+)\s+kB/);
      if (m) memoryMB = parseInt(m[1]) / 1024;
    } catch {}

    return { cpuPercent: Math.round(cpuPercent * 10) / 10, memoryMB: Math.round(memoryMB * 10) / 10 };
  } catch {
    return null;
  }
}

// ── Inode → PID map built from /proc/*/fd ───────────────────────────────────
function buildInodeMap(): Map<number, number> {
  const map = new Map<number, number>();
  try {
    const pids = readdirSync('/proc').filter(d => /^\d+$/.test(d));
    for (const pidStr of pids) {
      const pid = parseInt(pidStr);
      try {
        const fds = readdirSync(`/proc/${pid}/fd`);
        for (const fd of fds) {
          try {
            const link = readlinkSync(`/proc/${pid}/fd/${fd}`);
            const m = link.match(/^socket:\[(\d+)\]$/);
            if (m) map.set(parseInt(m[1]), pid);
          } catch {}
        }
      } catch {}
    }
  } catch {}
  return map;
}

// ── Process name from /proc/PID ─────────────────────────────────────────────
export function getProcessName(pid: number): string | null {
  try {
    return readFileSync(`/proc/${pid}/comm`, 'utf8').trim() || null;
  } catch {
    return null;
  }
}

export function getCommandForPid(pid: number): string | undefined {
  try {
    const raw = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    return raw.replace(/\0/g, ' ').trim().substring(0, 120) || undefined;
  } catch {
    return undefined;
  }
}

// Raw boot-relative start "tick" of a PID, from /proc/PID/stat field 22 —
// fixed for the process's lifetime and independent of wall-clock time.
// Comparing this across two separate readings (e.g. taken at different
// moments, by different processes) isn't thrown off by clock drift the way
// comparing ISO timestamps would be — WSL2's clock is prone to drift after
// the host sleeps. Used to confirm a PID we're about to trust hasn't since
// been reused by an unrelated process.
export function getStarttimeTicks(pid: number): number | null {
  try {
    const stat = readFileSync(`/proc/${pid}/stat`, 'utf8');
    const afterComm = stat.substring(stat.lastIndexOf(')') + 2).split(' ');
    const ticks = parseFloat(afterComm[19]); // field 22 overall
    return Number.isFinite(ticks) ? ticks : null;
  } catch {
    return null;
  }
}

// Raw argv, untruncated and unjoined — for actually re-executing a process
// (getCommandForPid's output is display-only: space-joined and cut to 120
// chars, which would silently corrupt args containing spaces and drop the
// tail of long commands if used to respawn).
export function getCommandArgv(pid: number): string[] | null {
  try {
    const raw = readFileSync(`/proc/${pid}/cmdline`, 'utf8');
    const parts = raw.split('\0').filter(Boolean);
    return parts.length ? parts : null;
  } catch {
    return null;
  }
}

export function getCwdForPid(pid: number): string | undefined {
  try {
    const full = realpathSync(`/proc/${pid}/cwd`);
    const parts = full.split('/').filter(Boolean);
    return parts.slice(-2).join('/') || full;
  } catch {
    return undefined;
  }
}

// Full, untruncated cwd — for spawning (getCwdForPid's output is a
// display-only shortened form, e.g. "descargas/Portmaster").
export function getFullCwdForPid(pid: number): string | undefined {
  try {
    return realpathSync(`/proc/${pid}/cwd`);
  } catch {
    return undefined;
  }
}

// ── Parse /proc/net/tcp or tcp6 ─────────────────────────────────────────────
// State 0A = LISTEN, 01 = ESTABLISHED (we only want LISTEN for our purposes)
function parseNetTcp(file: string, inodeMap: Map<number, number>): PortInfo[] {
  const results: PortInfo[] = [];
  try {
    const lines = readFileSync(file, 'utf8').split('\n').slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;

      const state = parts[3];
      if (state !== '0A') continue; // only LISTEN

      const localAddr = parts[1]; // "hex_ip:hex_port"
      const colonIdx = localAddr.lastIndexOf(':');
      if (colonIdx === -1) continue;

      const portHex = localAddr.substring(colonIdx + 1);
      const port = parseInt(portHex, 16);
      if (!port || port <= 0 || port > 65535) continue;

      const inode = parseInt(parts[9]);
      const pid = inode > 0 ? (inodeMap.get(inode) ?? null) : null;

      results.push({
        port,
        pid,
        process: pid ? getProcessName(pid) : null,
        protocol: 'TCP',
        state: 'LISTEN',
        address: `0.0.0.0:${port}`,
        source: 'linux',
        command: pid ? getCommandForPid(pid) : undefined,
        cwd: pid ? getCwdForPid(pid) : undefined,
      });
    }
  } catch {}
  return results;
}

// ── Parse /proc/net/udp or udp6 ─────────────────────────────────────────────
function parseNetUdp(file: string, inodeMap: Map<number, number>): PortInfo[] {
  const results: PortInfo[] = [];
  try {
    const lines = readFileSync(file, 'utf8').split('\n').slice(1);
    for (const line of lines) {
      const parts = line.trim().split(/\s+/);
      if (parts.length < 10) continue;

      const localAddr = parts[1];
      const colonIdx = localAddr.lastIndexOf(':');
      if (colonIdx === -1) continue;

      const portHex = localAddr.substring(colonIdx + 1);
      const port = parseInt(portHex, 16);
      if (!port || port <= 0 || port > 65535) continue;

      // Skip if remote port is also non-zero (means it's connected, not listening)
      const remoteAddr = parts[2];
      const remotePortHex = remoteAddr.split(':')[1] ?? '';
      const remotePort = parseInt(remotePortHex, 16);
      if (remotePort !== 0) continue;

      const inode = parseInt(parts[9]);
      const pid = inode > 0 ? (inodeMap.get(inode) ?? null) : null;

      results.push({
        port,
        pid,
        process: pid ? getProcessName(pid) : null,
        protocol: 'UDP',
        state: 'LISTEN',
        address: `0.0.0.0:${port}`,
        source: 'linux',
        command: pid ? getCommandForPid(pid) : undefined,
        cwd: pid ? getCwdForPid(pid) : undefined,
      });
    }
  } catch {}
  return results;
}

// ── Try ss first (faster), fall back to /proc/net/* ─────────────────────────
function scanLinuxPorts(inodeMap: Map<number, number>): PortInfo[] {
  // Try ss
  try {
    const { execSync } = require('child_process');
    const out = execSync('ss -Htlnup 2>/dev/null', { encoding: 'utf8', timeout: 4000 });
    const results: PortInfo[] = [];

    for (const line of out.split('\n')) {
      if (!line.trim()) continue;
      // ss -H format: State Recv-Q Send-Q Local:Port Peer:Port [Process]
      const cols = line.trim().split(/\s+/);
      if (cols.length < 5) continue;
      const hasNetid = /^(tcp|udp)/i.test(cols[0]);
      const localAddrIdx = hasNetid ? 4 : 3;
      const processStartIdx = localAddrIdx + 2;
      const addrCol = cols[localAddrIdx];
      if (!addrCol) continue;
      const ci = addrCol.lastIndexOf(':');
      const port = parseInt(addrCol.substring(ci + 1));
      if (!port || port <= 0 || port > 65535) continue;

      let pid: number | null = null;
      let processName: string | null = null;
      const proc = cols.slice(processStartIdx).join(' ');
      const pidM = proc.match(/pid=(\d+)/);
      const nmM  = proc.match(/"([^"]+)"/);
      if (pidM) pid = parseInt(pidM[1]);
      if (nmM)  processName = nmM[1];
      if (!processName && pid) processName = getProcessName(pid);

      results.push({
        port, pid, process: processName,
        protocol: /^udp/i.test(cols[0] ?? '') ? 'UDP' : 'TCP', state: 'LISTEN',
        address: addrCol, source: 'linux',
        command: pid ? getCommandForPid(pid) : undefined,
        cwd:     pid ? getCwdForPid(pid) : undefined,
      });
    }
    if (results.length > 0) return results;
  } catch {}

  // Fallback: /proc/net/*
  const all: PortInfo[] = [
    ...parseNetTcp('/proc/net/tcp',   inodeMap),
    ...parseNetTcp('/proc/net/tcp6',  inodeMap),
    ...parseNetUdp('/proc/net/udp',   inodeMap),
    ...parseNetUdp('/proc/net/udp6',  inodeMap),
  ];

  // Deduplicate by port+protocol
  const seen = new Set<string>();
  return all.filter(p => {
    const key = `${p.port}:${p.protocol}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// ── Public API ───────────────────────────────────────────────────────────────
export function scanPorts(targetPorts?: number[]): PortInfo[] {
  const inodeMap = buildInodeMap();
  let results = scanLinuxPorts(inodeMap);

  if (targetPorts) {
    results = results.filter(p => targetPorts.includes(p.port));
  }

  // Windows ports (WSL only)
  const wsl = detectWsl();
  if (wsl.isWsl) {
    for (const wp of getWindowsPorts()) {
      if (targetPorts && !targetPorts.includes(wp.port)) continue;
      if (wp.port <= 0 || wp.port > 65535) continue;
      // Skip if already seen from Linux side on same port+protocol
      const dup = results.some(r => r.port === wp.port && r.protocol === wp.protocol);
      if (!dup) {
        results.push({
          port: wp.port, pid: wp.pid, process: null,
          protocol: wp.protocol, state: wp.state,
          address: `0.0.0.0:${wp.port}`, source: 'windows',
        });
      }
    }
  }

  for (const r of results) {
    if (r.pid == null) continue;
    const stats = getProcessStats(r.pid);
    if (stats) { r.cpuPercent = stats.cpuPercent; r.memoryMB = stats.memoryMB; }
  }

  return results
    .filter(p => p.port > 0)
    .sort((a, b) => a.port - b.port);
}

export function isPortInUse(port: number): boolean {
  return scanPorts([port]).length > 0;
}

export function getPortInfo(port: number): PortInfo | null {
  return scanPorts([port])[0] ?? null;
}
