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

export function getWindowsPorts(): WindowsPort[] {
  const wslInfo = detectWsl();
  if (!wslInfo.isWsl) return [];

  try {
    // Call powershell.exe from within WSL to get Windows-side listeners
    const output = execSync(
      'powershell.exe -NoProfile -Command "netstat -ano | Select-String LISTENING"',
      { timeout: 5000, encoding: 'utf8' }
    );

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
    return [];
  }
}

export function getWindowsProcessName(pid: number): string | null {
  try {
    const output = execSync(
      `powershell.exe -NoProfile -Command "Get-Process -Id ${pid} -ErrorAction SilentlyContinue | Select-Object -ExpandProperty ProcessName"`,
      { timeout: 3000, encoding: 'utf8' }
    );
    return output.trim() || null;
  } catch {
    return null;
  }
}
