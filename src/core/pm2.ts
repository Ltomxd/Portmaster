import { execSync } from 'child_process';

export interface Pm2Process {
  id: number;
  name: string;
  pid: number | null;
  status: 'online' | 'stopped' | 'errored' | 'stopping' | string;
  cpu: number;
  memory: number;
  restarts: number;
  uptime: number | null;
  port?: number | null;
  namespace: string;
  script: string;
  cwd: string;
}

export function isPm2Available(): boolean {
  try {
    execSync('pm2 --version 2>/dev/null', { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export function getPm2Processes(): Pm2Process[] {
  if (!isPm2Available()) return [];

  try {
    const raw = execSync('pm2 jlist 2>/dev/null', {
      encoding: 'utf8',
      timeout: 8000,
    });

    const list = JSON.parse(raw);
    if (!Array.isArray(list)) return [];

    return list.map((p: any) => ({
      id: p.pm_id ?? p.pmId ?? 0,
      name: p.name ?? 'unknown',
      pid: p.pid || null,
      status: p.pm2_env?.status ?? 'unknown',
      cpu: p.monit?.cpu ?? 0,
      memory: p.monit?.memory ?? 0,
      restarts: p.pm2_env?.restart_time ?? 0,
      uptime: p.pm2_env?.pm_uptime ?? null,
      port: p.pm2_env?.PORT ? parseInt(p.pm2_env.PORT) : extractPortFromEnv(p),
      namespace: p.pm2_env?.namespace ?? 'default',
      script: p.pm2_env?.pm_exec_path ?? '',
      cwd: p.pm2_env?.pm_cwd ?? '',
    }));
  } catch {
    return [];
  }
}

function extractPortFromEnv(proc: any): number | null {
  const env = proc.pm2_env?.env ?? {};
  const port = env.PORT ?? env.port ?? env.APP_PORT;
  return port ? parseInt(port) : null;
}

export function pm2Action(
  action: 'start' | 'stop' | 'restart' | 'delete',
  nameOrId: string | number
): { success: boolean; error?: string } {
  if (!isPm2Available()) return { success: false, error: 'PM2 not available' };
  try {
    execSync(`pm2 ${action} ${nameOrId} 2>&1`, { timeout: 15000, encoding: 'utf8' });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.stderr?.toString() ?? e.message };
  }
}

export function pm2Save(): { success: boolean; error?: string } {
  try {
    execSync('pm2 save 2>&1', { timeout: 5000 });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.message };
  }
}

export function getPm2Logs(nameOrId: string | number, lines = 50): string {
  try {
    return execSync(`pm2 logs ${nameOrId} --lines ${lines} --nostream 2>&1`, {
      encoding: 'utf8',
      timeout: 5000,
    });
  } catch {
    return '';
  }
}

export function formatMemory(bytes: number): string {
  if (bytes > 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024 / 1024).toFixed(1)}GB`;
  if (bytes > 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)}MB`;
  if (bytes > 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
}

export function formatUptime(ms: number | null): string {
  if (!ms) return '—';
  const elapsed = Date.now() - ms;
  const s = Math.floor(elapsed / 1000);
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ${s % 60}s`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ${m % 60}m`;
  return `${Math.floor(h / 24)}d ${h % 24}h`;
}
