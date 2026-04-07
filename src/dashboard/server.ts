import express from 'express';
import * as http from 'http';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { execSync } from 'child_process';
import { readFileSync, accessSync } from 'fs';
import { scanPorts } from '../core/scanner';
import { getContainers, isDockerAvailable, stopContainer, startContainer, restartContainer, getContainerLogs } from '../core/docker';
import { getPm2Processes, isPm2Available, pm2Action } from '../core/pm2';
import { killPort } from '../core/killer';
import { getAllGuards } from '../core/guard';
import { detectWsl } from '../core/wsl';

export interface DashboardOptions {
  port?: number;
  host?: string;
  refreshInterval?: number;
}

// CPU delta tracking
let prevCpuTotal = 0, prevCpuIdle = 0;

export function startDashboard(options: DashboardOptions = {}): void {
  const PORT = options.port ?? 4321;
  const HOST = options.host ?? '0.0.0.0';
  const INTERVAL = options.refreshInterval ?? 3000;

  const app = express();
  app.use(express.json());

  // ── Serve Vite build ──────────────────────────────────────────────────────
  const distCandidates = [
    path.join(__dirname, '../../dashboard/dist'),
    path.join(__dirname, '../../../dashboard/dist'),
    path.join(process.cwd(), 'dashboard/dist'),
  ];
  const distPath = distCandidates.find(p => { try { accessSync(p); return true; } catch { return false; } }) ?? '';

  if (distPath) {
    app.use(express.static(distPath));
    console.log(`  Serving dashboard from: ${distPath}`);
  }

  // ── REST API ──────────────────────────────────────────────────────────────
  app.get('/api/snapshot', (_req, res) => res.json(collectSnapshot()));
  app.get('/api/ports',    (_req, res) => res.json(scanPorts()));
  app.get('/api/system',   (_req, res) => res.json(getSystemInfo()));
  app.get('/api/docker',   (_req, res) => res.json({ available: isDockerAvailable(), containers: getContainers(true) }));
  app.get('/api/pm2',      (_req, res) => res.json({ available: isPm2Available(), processes: getPm2Processes() }));

  app.get('/api/guards', (_req, res) => {
    const out: Record<string, any> = {};
    for (const [k, g] of getAllGuards()) {
      out[k] = { running: g.isRunning(), recentEvents: g.getEventLog().slice(-20) };
    }
    res.json(out);
  });

  app.post('/api/ports/:port/kill', (req, res) => {
    const result = killPort(parseInt(req.params.port));
    res.json(result);
  });

  app.post('/api/docker/:name/:action', (req, res) => {
    const { name, action } = req.params;
    const fns: Record<string, Function> = { stop: stopContainer, start: startContainer, restart: restartContainer };
    res.json(fns[action] ? fns[action](name) : { success: false, error: 'unknown action' });
  });

  app.get('/api/docker/:name/logs', (req, res) => {
    res.json({ logs: getContainerLogs(req.params.name, parseInt(req.query.lines as string ?? '50')) });
  });

  app.post('/api/pm2/:name/:action', (req, res) => {
    const { name, action } = req.params;
    if (!['start','stop','restart','delete'].includes(action)) return res.json({ success: false, error: 'invalid' });
    res.json(pm2Action(action as any, name));
  });

  // SPA fallback
  app.get('*', (_req, res) => {
    if (distPath) {
      res.sendFile(path.join(distPath, 'index.html'));
    } else {
      res.send(fallbackHtml());
    }
  });

  // ── WebSocket ─────────────────────────────────────────────────────────────
  const server = http.createServer(app);
  const wss = new WebSocketServer({ server });
  const clients = new Set<WebSocket>();

  wss.on('connection', ws => {
    clients.add(ws);
    // Send snapshot immediately on connect
    try { ws.send(JSON.stringify(collectSnapshot())); } catch {}
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  function broadcast(data: unknown) {
    const msg = JSON.stringify(data);
    for (const ws of clients) {
      if (ws.readyState === WebSocket.OPEN) {
        try { ws.send(msg); } catch {}
      }
    }
  }

  setInterval(() => broadcast(collectSnapshot()), INTERVAL);

  server.listen(PORT, HOST, () => {
    console.log(`\n  ✓ Dashboard → http://${HOST}:${PORT}\n`);
    if (!distPath) console.log('  ⚠ Frontend not built. Run: cd dashboard && npm run build\n');
  });
}

// ── Data collection ──────────────────────────────────────────────────────────
function collectSnapshot() {
  return {
    timestamp: new Date().toISOString(),
    ports:     scanPorts(),
    docker:    isDockerAvailable() ? getContainers(true) : [],
    pm2:       isPm2Available()    ? getPm2Processes()   : [],
    system:    getSystemInfo(),
    wsl:       detectWsl(),
    guards:    (() => {
      const out: Record<string, any> = {};
      for (const [k, g] of getAllGuards()) out[k] = { running: g.isRunning(), recentEvents: g.getEventLog().slice(-20) };
      return out;
    })(),
  };
}

function getSystemInfo() {
  // CPU (delta)
  let cpu = 0;
  try {
    const row = readFileSync('/proc/stat', 'utf8').split('\n')[0].split(/\s+/).slice(1).map(Number);
    const idle  = row[3] + (row[4] ?? 0);
    const total = row.reduce((a, b) => a + b, 0);
    if (prevCpuTotal > 0 && total > prevCpuTotal) {
      cpu = Math.max(0, Math.min(100, Math.round(((total - prevCpuTotal) - (idle - prevCpuIdle)) / (total - prevCpuTotal) * 100)));
    }
    prevCpuTotal = total; prevCpuIdle = idle;
  } catch {}

  // CPU cores
  let cores = 1;
  try { cores = (readFileSync('/proc/cpuinfo','utf8').match(/^processor\s*:/gm) ?? []).length || 1; } catch {}

  // Memory
  let memTotal = 0, memFree = 0;
  try {
    const m = readFileSync('/proc/meminfo', 'utf8');
    const tot   = m.match(/MemTotal:\s+(\d+)/);
    const avail = m.match(/MemAvailable:\s+(\d+)/);
    if (tot)   memTotal = parseInt(tot[1])   * 1024;
    if (avail) memFree  = parseInt(avail[1]) * 1024;
  } catch {}

  // Disk
  let diskTotal = 0, diskUsed = 0, diskFree = 0;
  try {
    const df = execSync('df -k / 2>/dev/null', { encoding: 'utf8', timeout: 3000 });
    const row = df.split('\n')[1]?.trim().split(/\s+/);
    if (row?.length >= 4) {
      diskTotal = parseInt(row[1]) * 1024;
      diskUsed  = parseInt(row[2]) * 1024;
      diskFree  = parseInt(row[3]) * 1024;
    }
  } catch {}

  // Load + uptime
  let loadAvg = [0, 0, 0], uptimeSec = 0;
  try { const la = readFileSync('/proc/loadavg','utf8').split(' '); loadAvg = [parseFloat(la[0]),parseFloat(la[1]),parseFloat(la[2])]; } catch {}
  try { uptimeSec = parseFloat(readFileSync('/proc/uptime','utf8').split(' ')[0]); } catch {}

  const d = Math.floor(uptimeSec / 86400);
  const h = Math.floor((uptimeSec % 86400) / 3600);
  const uptime = d > 0 ? `${d}d ${h}h` : `${h}h ${Math.floor((uptimeSec % 3600) / 60)}m`;

  return {
    cpu, cores,
    memory: { total: memTotal, free: memFree, used: memTotal - memFree,
              usedPercent: memTotal ? Math.round((memTotal - memFree) / memTotal * 100) : 0 },
    disk:   { total: diskTotal, used: diskUsed, free: diskFree,
              usedPercent: diskTotal ? Math.round(diskUsed / diskTotal * 100) : 0 },
    loadAvg, uptime, uptimeSeconds: uptimeSec,
    lastUpdated: new Date().toLocaleTimeString(),
  };
}

function fallbackHtml(): string {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Portmaster</title></head>
<body style="background:#0f1117;color:#e2e8f0;font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;flex-direction:column;gap:16px;margin:0">
  <h2 style="margin:0;font-size:24px">⚡ Portmaster</h2>
  <p style="color:#64748b;margin:0">Build the frontend first:</p>
  <code style="background:#1c2333;padding:12px 24px;border-radius:8px;color:#a78bfa;font-size:14px">cd dashboard && npm run build</code>
  <p style="color:#64748b;margin:0;font-size:12px">Then restart: portmaster dashboard</p>
</body></html>`;
}
