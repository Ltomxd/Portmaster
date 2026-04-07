import { execSync } from 'child_process';
import { getPortInfo, PortInfo } from './scanner';

export interface KillResult {
  port: number;
  pid: number | null;
  process: string | null;
  success: boolean;
  error?: string;
  source: 'linux' | 'windows';
}

export interface RestartRecord {
  port: number;
  command: string;
  cwd: string;
  killedAt: string;
  process: string | null;
}

const restartHistory = new Map<number, RestartRecord>();

export function killPort(port: number, safe = false): KillResult {
  const info = getPortInfo(port);

  if (!info) {
    return { port, pid: null, process: null, success: false, error: 'Port not in use', source: 'linux' };
  }

  if (info.source === 'windows') {
    return killWindowsPort(port, info);
  }

  if (!info.pid) {
    // Try fuser as fallback
    try {
      execSync(`fuser -k ${port}/tcp 2>/dev/null`, { timeout: 5000 });
      return { port, pid: null, process: info.process, success: true, source: 'linux' };
    } catch (e) {
      return { port, pid: null, process: null, success: false, error: 'No PID found', source: 'linux' };
    }
  }

  // Save restart history before killing
  if (info.command) {
    restartHistory.set(port, {
      port,
      command: info.command,
      cwd: getCwdForPid(info.pid) ?? process.cwd(),
      killedAt: new Date().toISOString(),
      process: info.process,
    });
  }

  try {
    execSync(`kill -9 ${info.pid} 2>/dev/null`, { timeout: 3000 });
    return { port, pid: info.pid, process: info.process, success: true, source: 'linux' };
  } catch (e: any) {
    // Try with sudo as fallback
    try {
      execSync(`sudo kill -9 ${info.pid} 2>/dev/null`, { timeout: 3000 });
      return { port, pid: info.pid, process: info.process, success: true, source: 'linux' };
    } catch (e2: any) {
      return {
        port,
        pid: info.pid,
        process: info.process,
        success: false,
        error: e2.message,
        source: 'linux',
      };
    }
  }
}

function killWindowsPort(port: number, info: PortInfo): KillResult {
  try {
    const { execSync } = require('child_process');
    execSync(
      `powershell.exe -NoProfile -Command "Stop-Process -Id ${info.pid} -Force -ErrorAction SilentlyContinue"`,
      { timeout: 5000 }
    );
    return { port, pid: info.pid, process: info.process, success: true, source: 'windows' };
  } catch (e: any) {
    return {
      port,
      pid: info.pid,
      process: info.process,
      success: false,
      error: `Windows process kill failed: ${e.message}`,
      source: 'windows',
    };
  }
}

export function killPid(pid: number): { success: boolean; error?: string } {
  try {
    execSync(`kill -9 ${pid}`, { timeout: 3000 });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export function getRestartHistory(): RestartRecord[] {
  return Array.from(restartHistory.values());
}

export function restartPort(port: number): { success: boolean; error?: string } {
  const record = restartHistory.get(port);
  if (!record) {
    return { success: false, error: `No restart info saved for port ${port}` };
  }

  try {
    const { spawn } = require('child_process');
    const parts = record.command.split(' ');
    const proc = spawn(parts[0], parts.slice(1), {
      cwd: record.cwd,
      detached: true,
      stdio: 'ignore',
    });
    proc.unref();
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

function getCwdForPid(pid: number): string | null {
  try {
    return require('fs').realpathSync(`/proc/${pid}/cwd`);
  } catch {
    return null;
  }
}
