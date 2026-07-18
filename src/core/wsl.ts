import { execSync } from 'child_process';

export interface WslInfo {
  isWsl: boolean;
  wslVersion: number | null;
  distro: string | null;
}

export interface WindowsPort {
  port: number;
  pid: number;
  protocol: 'TCP' | 'UDP';
  state: string;
  source: 'windows';
}

export function detectWsl(): WslInfo {
  try {
    const osRelease = require('fs').readFileSync('/proc/sys/kernel/osrelease', 'utf8').toLowerCase();
    if (osRelease.includes('microsoft') || osRelease.includes('wsl')) {
      const version = osRelease.includes('wsl2') || osRelease.includes('microsoft-standard-wsl2') ? 2 : 1;
      let distro: string | null = null;
      try {
        distro = require('fs').readFileSync('/etc/os-release', 'utf8')
          .split('\n').find((l: string) => l.startsWith('PRETTY_NAME'))
          ?.split('=')[1]?.replace(/"/g, '') ?? null;
      } catch {}
      return { isWsl: true, wslVersion: version, distro };
    }
  } catch {}
  return { isWsl: false, wslVersion: null, distro: null };
}

// ── Circuit breaker for a broken/hanging powershell.exe ─────────────────────
// The dashboard calls this every snapshot cycle (~3s). If the user's Windows
// PowerShell install is broken (seen in the wild: CLR crashes, out-of-memory
// exceptions inside powershell.exe itself), hammering it every few seconds
// wastes a full 5s timeout each time and can pile up overlapping processes.
// After a few consecutive failures, back off for a cooldown period instead
// of retrying forever.
const MAX_CONSECUTIVE_FAILURES = 3;
const COOLDOWN_MS = 60_000;
let consecutiveFailures = 0;
let circuitOpenUntil = 0;
let warnedOpen = false;

function recordPowershellFailure(): void {
  consecutiveFailures++;
  if (consecutiveFailures >= MAX_CONSECUTIVE_FAILURES && Date.now() >= circuitOpenUntil) {
    circuitOpenUntil = Date.now() + COOLDOWN_MS;
    if (!warnedOpen) {
      console.warn(`[wsl] powershell.exe failed ${consecutiveFailures}x in a row — pausing Windows-port scanning for ${COOLDOWN_MS / 1000}s. Windows-side ports/processes won't show up until it recovers.`);
      warnedOpen = true;
    }
  }
}

function recordPowershellSuccess(): void {
  consecutiveFailures = 0;
  circuitOpenUntil = 0;
  warnedOpen = false;
}

export function getWindowsPorts(): WindowsPort[] {
  const wslInfo = detectWsl();
  if (!wslInfo.isWsl) return [];
  if (Date.now() < circuitOpenUntil) return [];

  try {
    // Call powershell.exe from within WSL to get Windows-side listeners.
    // stdio explicitly silences the child's stderr — execSync passes it
    // through to our own stderr by default, and a crashing powershell.exe
    // dumps multi-KB .NET stack traces that would otherwise flood our logs.
    const output = execSync(
      'powershell.exe -NoProfile -Command "netstat -ano | Select-String LISTENING"',
      { timeout: 5000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    recordPowershellSuccess();

    const ports: WindowsPort[] = [];
    const lines = output.split('\n');

    for (const line of lines) {
      // TCP    0.0.0.0:3000    0.0.0.0:0    LISTENING    1234
      const match = line.trim().match(/^(TCP|UDP)\s+[\d.*]+:(\d+)\s+[\d.*]+:\d+\s+(\w+)\s+(\d+)/i);
      if (match) {
        const port = parseInt(match[2]);
        const pid = parseInt(match[4]);
        if (port > 0 && port <= 65535 && pid > 0) {
          ports.push({
            port,
            pid,
            protocol: match[1].toUpperCase() as 'TCP' | 'UDP',
            state: match[3],
            source: 'windows',
          });
        }
      }
    }
    return ports;
  } catch {
    recordPowershellFailure();
    return [];
  }
}

export function getWindowsProcessName(pid: number): string | null {
  try {
    const output = execSync(
      `powershell.exe -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName"`,
      { timeout: 3000, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }
    );
    return output.trim() || null;
  } catch {
    return null;
  }
}
