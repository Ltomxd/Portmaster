import { execSync } from 'child_process';

export interface DockerContainer {
  id: string;
  name: string;
  image: string;
  status: string;
  state: 'running' | 'exited' | 'paused' | 'restarting' | 'dead' | 'created' | string;
  ports: DockerPort[];
  created: string;
  uptime?: string;
}

export interface DockerPort {
  containerPort: number;
  hostPort: number | null;
  protocol: 'tcp' | 'udp';
  hostIp?: string;
}

export function isDockerAvailable(): boolean {
  try {
    execSync('docker info 2>/dev/null', { timeout: 3000 });
    return true;
  } catch {
    return false;
  }
}

export function getContainers(all = false): DockerContainer[] {
  try {
    const flag = all ? '-a' : '';
    const raw = execSync(
      `docker ps ${flag} --format '{{json .}}' 2>/dev/null`,
      { encoding: 'utf8', timeout: 5000 }
    );

    const containers: DockerContainer[] = [];
    for (const line of raw.trim().split('\n')) {
      if (!line.trim()) continue;
      try {
        const obj = JSON.parse(line);
        containers.push(parseContainer(obj));
      } catch {}
    }
    return containers;
  } catch {
    return [];
  }
}

function parseContainer(obj: any): DockerContainer {
  const ports = parsePorts(obj.Ports ?? '');
  return {
    id: (obj.ID ?? obj.Id ?? '').substring(0, 12),
    name: obj.Names ?? obj.Name ?? 'unknown',
    image: obj.Image ?? '',
    status: obj.Status ?? '',
    state: (obj.State ?? 'unknown').toLowerCase(),
    ports,
    created: obj.CreatedAt ?? obj.Created ?? '',
    uptime: obj.Status ?? '',
  };
}

function parsePorts(raw: string): DockerPort[] {
  if (!raw) return [];
  const ports: DockerPort[] = [];
  // "0.0.0.0:3000->3000/tcp, 0.0.0.0:5432->5432/tcp"
  const parts = raw.split(',');
  for (const part of parts) {
    const trimmed = part.trim();
    const arrowMatch = trimmed.match(/(?:([\d.]+):)?(\d+)->(\d+)\/(tcp|udp)/);
    if (arrowMatch) {
      ports.push({
        hostIp: arrowMatch[1],
        hostPort: parseInt(arrowMatch[2]),
        containerPort: parseInt(arrowMatch[3]),
        protocol: arrowMatch[4] as 'tcp' | 'udp',
      });
    } else {
      const exposedMatch = trimmed.match(/(\d+)\/(tcp|udp)/);
      if (exposedMatch) {
        ports.push({
          containerPort: parseInt(exposedMatch[1]),
          hostPort: null,
          protocol: exposedMatch[2] as 'tcp' | 'udp',
        });
      }
    }
  }
  return ports;
}

export function stopContainer(nameOrId: string): { success: boolean; error?: string } {
  try {
    execSync(`docker stop ${nameOrId} 2>&1`, { timeout: 15000 });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.stderr?.toString() ?? e.message };
  }
}

export function startContainer(nameOrId: string): { success: boolean; error?: string } {
  try {
    execSync(`docker start ${nameOrId} 2>&1`, { timeout: 15000 });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.stderr?.toString() ?? e.message };
  }
}

export function restartContainer(nameOrId: string): { success: boolean; error?: string } {
  try {
    execSync(`docker restart ${nameOrId} 2>&1`, { timeout: 15000 });
    return { success: true };
  } catch (e: any) {
    return { success: false, error: e.stderr?.toString() ?? e.message };
  }
}

export function getContainerLogs(nameOrId: string, lines = 50): string {
  try {
    return execSync(`docker logs --tail=${lines} ${nameOrId} 2>&1`, {
      encoding: 'utf8',
      timeout: 5000,
    });
  } catch {
    return '';
  }
}

export function getDockerComposeServices(): string[] {
  try {
    const output = execSync('docker compose ps --services 2>/dev/null || docker-compose ps --services 2>/dev/null', {
      encoding: 'utf8',
      timeout: 5000,
    });
    return output.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}
