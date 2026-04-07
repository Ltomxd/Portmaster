import { readFileSync, readdirSync, readlinkSync } from 'fs';
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
function getProcessName(pid: number): string | null {
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

export function getCwdForPid(pid: number): string | undefined {
  try {
    const { realpathSync } = require('fs');
    const full = realpathSync(`/proc/${pid}/cwd`);
    const parts = full.split('/').filter(Boolean);
    return parts.slice(-2).join('/') || full;
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
      if (cols.length < 4) continue;

      const addrCol = cols[3];
      const ci = addrCol.lastIndexOf(':');
      const port = parseInt(addrCol.substring(ci + 1));
      if (!port || port <= 0 || port > 65535) continue;

      let pid: number | null = null;
      let processName: string | null = null;
      const proc = cols.slice(5).join(' ');
      const pidM = proc.match(/pid=(\d+)/);
      const nmM  = proc.match(/"([^"]+)"/);
      if (pidM) pid = parseInt(pidM[1]);
      if (nmM)  processName = nmM[1];
      if (!processName && pid) processName = getProcessName(pid);

      results.push({
        port, pid, process: processName,
        protocol: 'TCP', state: 'LISTEN',
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
