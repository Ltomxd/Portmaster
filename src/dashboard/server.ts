import express from 'express';
import * as http from 'http';
import * as path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import { execSync, spawn, ChildProcessByStdio } from 'child_process';
import type { Readable } from 'stream';
import type { Socket } from 'net';
import { readFileSync, accessSync } from 'fs';
import { scanPorts, isPortInUse, getPortInfo } from '../core/scanner';
import { getContainers, isDockerAvailable, stopContainer, startContainer, restartContainer, getContainerLogs } from '../core/docker';
import { getPm2Processes, isPm2Available, pm2Action, getPm2Logs } from '../core/pm2';
import { killPort } from '../core/killer';
import { getAllGuards, startGuard, stopGuard } from '../core/guard';
import { detectWsl } from '../core/wsl';
import { getProcessSecurity, getConnectionsForPort, getSecurityLogs, resolveHostLogPath } from '../core/inspect';
import { adoptPort, getManagedProcess, getManagedPortMap } from '../core/supervisor';
import { stripAnsi } from '../core/ansi';
import { getConfig, setProjectsRoot } from '../core/config';
import { browseProjects, resolveProjectPath } from '../core/projects';
import { getOrCreateShell, killShellSession, listActiveShellPaths } from '../core/terminal';

export interface DashboardOptions {
  port?: number;
  host?: string;
  refreshInterval?: number;
}


function serializeGuards() {
  const out: Record<string, any> = {};
  for (const [k, g] of getAllGuards()) {
    const options = g.getOptions();
    out[k] = {
      running: g.isRunning(),
      recentEvents: g.getEventLog().slice(-20),
      ports: options.ports,
      autoKill: options.autoKill,
      allowedProcesses: options.allowedProcesses,
      intervalMs: options.intervalMs,
    };
  }
  return out;
}

// CPU delta tracking
let prevCpuTotal = 0, prevCpuIdle = 0;

export function startDashboard(options: DashboardOptions = {}): void {
  const PORT = options.port ?? 54321;
  const HOST = options.host ?? '0.0.0.0';

  if (isPortInUse(PORT)) {
    throw new Error(`Dashboard port ${PORT} is already in use. Stop the existing service or run with --port <free_port>.`);
  }

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
    res.json(serializeGuards());
  });

  // Alias for common typo /api/guard
  app.get('/api/guard', (_req, res) => {
    res.json(serializeGuards());
  });

  app.post('/api/guards', (req, res) => {
    const { key, ports, autoKill, allowedProcesses, intervalMs } = req.body ?? {};
    if (!key || !Array.isArray(ports) || ports.length === 0) {
      return res.status(400).json({ success: false, error: 'key and ports are required' });
    }
    startGuard(String(key), {
      ports: ports.map((p: any) => parseInt(String(p))).filter((p: number) => p > 0 && p <= 65535),
      autoKill: Boolean(autoKill),
      allowedProcesses: Array.isArray(allowedProcesses) ? allowedProcesses.map((v: any) => String(v)).filter(Boolean) : [],
      intervalMs: intervalMs ? parseInt(String(intervalMs)) : 1500,
    });
    res.json({ success: true });
  });

  app.patch('/api/guards/:key', (req, res) => {
    const key = req.params.key;
    const guard = getAllGuards().get(key);
    if (!guard) return res.status(404).json({ success: false, error: 'guard not found' });

    const current = guard.getOptions();
    const body = req.body ?? {};
    startGuard(key, {
      ports: Array.isArray(body.ports) ? body.ports.map((p: any) => parseInt(String(p))).filter((p: number) => p > 0 && p <= 65535) : current.ports,
      autoKill: typeof body.autoKill === 'boolean' ? body.autoKill : current.autoKill,
      allowedProcesses: Array.isArray(body.allowedProcesses) ? body.allowedProcesses.map((v: any) => String(v)).filter(Boolean) : current.allowedProcesses,
      intervalMs: body.intervalMs ? parseInt(String(body.intervalMs)) : current.intervalMs,
    });

    res.json({ success: true });
  });

  app.delete('/api/guards/:key', (req, res) => {
    stopGuard(req.params.key);
    res.json({ success: true });
  });


  app.get('/api/ports/:port/logs', (req, res) => {
    const port = parseInt(req.params.port);
    const lines = parseInt(String(req.query.lines ?? '80'));
    if (!port || port <= 0) return res.status(400).json({ success: false, error: 'invalid port' });

    const info = getPortInfo(port);
    const dockerMatches = getContainers(true).filter(c => (c.ports ?? []).some(p => p.hostPort === port));
    const pm2Matches = getPm2Processes().filter(p => p.port === port || (info?.pid && p.pid === info.pid));

    const sections: string[] = [];
    if (info) {
      sections.push(`[process] port :${port} pid=${info.pid ?? '—'} name=${info.process ?? '—'} source=${info.source}`);
      if (info.command) sections.push(`[command] ${info.command}`);
      if (info.cwd) sections.push(`[cwd] ${info.cwd}`);
    }

    for (const c of dockerMatches) {
      const logs = getContainerLogs(c.name, lines).trim();
      sections.push(`
[docker:${c.name}]
${logs || '(no logs)'}`);
    }

    for (const p of pm2Matches) {
      const logs = getPm2Logs(p.name, lines).trim();
      sections.push(`
[pm2:${p.name}]
${logs || '(no logs)'}`);
    }

    if (sections.length === 0) {
      sections.push('No logs available for this port. It may be a host process without captured stdout/stderr.');
    }

    res.json({ success: true, port, info, logs: sections.join('\n') });
  });

  app.get('/api/inspect/:pid', (req, res) => {
    const pid = parseInt(req.params.pid);
    const port = parseInt(String(req.query.port ?? ''));
    if (!pid || pid <= 0) return res.status(400).json({ success: false, error: 'invalid pid' });
    if (!port || port <= 0) return res.status(400).json({ success: false, error: 'invalid port' });

    const process_ = getProcessSecurity(pid);
    const connections = getConnectionsForPort(port);
    const logs = getSecurityLogs(pid, process_.name, 100);

    res.json({ success: true, pid, port, process: process_, connections, logs });
  });

  app.post('/api/ports/:port/adopt', async (req, res) => {
    const port = parseInt(req.params.port);
    if (!port || port <= 0) return res.status(400).json({ success: false, error: 'invalid port' });
    const result = await adoptPort(port);
    res.json(result);
  });

  app.get('/api/projects/root', (_req, res) => {
    res.json({ success: true, projectsRoot: getConfig().projectsRoot });
  });

  app.post('/api/projects/root', (req, res) => {
    const p = String(req.body?.path ?? '').trim();
    if (!p) return res.status(400).json({ success: false, error: 'path is required' });
    res.json(setProjectsRoot(p));
  });

  app.get('/api/projects/browse', (req, res) => {
    res.json(browseProjects(String(req.query.path ?? '')));
  });

  app.get('/api/terminal/sessions', (_req, res) => {
    const root = getConfig().projectsRoot;
    const paths = root ? listActiveShellPaths().map(p => path.relative(root, p)) : [];
    res.json({ success: true, paths });
  });

  app.post('/api/terminal/kill', (req, res) => {
    const relPath = String(req.body?.cwd ?? '');
    const cwd = resolveProjectPath(relPath);
    if (!cwd) return res.status(400).json({ success: false, error: 'invalid path' });
    res.json({ success: killShellSession(cwd) });
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

  // Return JSON for unknown API routes (avoid HTML fallback confusion)
  app.use('/api', (_req, res) => {
    res.status(404).json({ success: false, error: 'API route not found' });
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
  // Three logical channels share one HTTP server: the snapshot broadcast
  // (root path), on-demand live log streams (/ws-logs/:kind/:id), and
  // interactive terminal sessions (/ws-terminal). All use `noServer: true`
  // and are dispatched manually from a single 'upgrade' listener —
  // attaching multiple `{ server }` WebSocketServers directly would race to
  // handle the same upgrade event.
  const server = http.createServer(app);
  // perMessageDeflate is on by default in `ws` — it costs a real zlib
  // deflate/inflate call per message for essentially no payoff on traffic
  // this small (a keystroke, a snapshot diff), and adds latency on exactly
  // the connection (the terminal) where that matters most. Everything here
  // is localhost-only, so there's no bandwidth to trade for it.
  const wss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const logsWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const terminalWss = new WebSocketServer({ noServer: true, perMessageDeflate: false });
  const clients = new Set<WebSocket>();

  wss.on('connection', ws => {
    clients.add(ws);
    // Send snapshot immediately on connect
    try { ws.send(JSON.stringify(collectSnapshot())); } catch {}
    ws.on('close', () => clients.delete(ws));
    ws.on('error', () => clients.delete(ws));
  });

  logsWss.on('connection', (ws, req: http.IncomingMessage) => handleLogSocket(ws, req));
  terminalWss.on('connection', (ws, req: http.IncomingMessage) => handleTerminalSocket(ws, req));

  server.on('upgrade', (req, socket, head) => {
    // Nagle's algorithm batches small TCP writes to wait for more data (or
    // an ACK) before sending — great for throughput, bad for anything
    // interactive. Every keystroke in the terminal is its own tiny packet.
    // Combined with delayed ACKs on the other end, that pairing is a
    // textbook cause of the ~40ms+ stutter this produces; the standard fix
    // for any latency-sensitive socket (terminals, games, chat) is to
    // disable it.
    (socket as Socket).setNoDelay(true);
    const pathname = (req.url ?? '/').split('?')[0];
    if (pathname.startsWith('/ws-logs/')) {
      logsWss.handleUpgrade(req, socket, head, ws => logsWss.emit('connection', ws, req));
    } else if (pathname === '/ws-terminal') {
      terminalWss.handleUpgrade(req, socket, head, ws => terminalWss.emit('connection', ws, req));
    } else {
      wss.handleUpgrade(req, socket, head, ws => wss.emit('connection', ws, req));
    }
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

// ── Live log streaming (docker / pm2 / journalctl -f / tail -f) ─────────────

function sendLog(ws: WebSocket, type: 'status' | 'line' | 'error', data: string) {
  if (ws.readyState === WebSocket.OPEN) {
    try { ws.send(JSON.stringify({ type, data })); } catch {}
  }
}

function handleLogSocket(ws: WebSocket, req: http.IncomingMessage) {
  // URL shape: /ws-logs/<kind>/<id>  where kind ∈ docker|pm2|journal|managed
  const pathname = (req.url ?? '/').split('?')[0];
  const segments = pathname.split('/').filter(Boolean); // ['ws-logs', kind, id]
  const kind = segments[1];
  const idRaw = decodeURIComponent(segments[2] ?? '');

  if (kind === 'managed') {
    // Adopted processes are children of THIS server process — no subprocess
    // to spawn, just tap the pipe we're already holding.
    const pid = parseInt(idRaw);
    const proc = pid ? getManagedProcess(pid) : undefined;
    if (!proc) { sendLog(ws, 'error', 'Managed process not found (it may have exited)'); ws.close(); return; }

    sendLog(ws, 'status', 'connecting:managed:' + idRaw);
    sendLog(ws, 'status', 'live:managed');
    if (proc.buffer.length) sendLog(ws, 'line', proc.buffer.join('\n'));

    const onData = (chunk: Buffer) => sendLog(ws, 'line', stripAnsi(chunk.toString('utf8')));
    const onExit = () => { sendLog(ws, 'status', 'closed'); try { ws.close(); } catch {} };
    proc.child.stdout.on('data', onData);
    proc.child.stderr.on('data', onData);
    proc.child.once('exit', onExit);

    const cleanup = () => {
      proc.child.stdout.off('data', onData);
      proc.child.stderr.off('data', onData);
      proc.child.off('exit', onExit);
    };
    ws.on('close', cleanup);
    ws.on('error', cleanup);
    return;
  }

  let cmd: string;
  let args: string[];
  let sourceNote: string | undefined;

  if (kind === 'docker') {
    const exists = getContainers(true).some(c => c.name === idRaw || c.id === idRaw);
    if (!exists) { sendLog(ws, 'error', `Container not found: ${idRaw}`); ws.close(); return; }
    cmd = 'docker'; args = ['logs', '-f', '--tail', '150', idRaw];
  } else if (kind === 'pm2') {
    const exists = getPm2Processes().some(p => p.name === idRaw || String(p.id) === idRaw);
    if (!exists) { sendLog(ws, 'error', `PM2 process not found: ${idRaw}`); ws.close(); return; }
    cmd = 'pm2'; args = ['logs', idRaw, '--lines', '100'];
  } else if (kind === 'journal') {
    const pid = parseInt(idRaw);
    if (!pid || pid <= 0) { sendLog(ws, 'error', 'invalid pid'); ws.close(); return; }
    // A hand-run dev server almost never logs to journald — its stdout/stderr
    // usually go to a terminal or a redirected file. Prefer tailing that real
    // file when we can find one; journalctl is the fallback, not the default.
    const logPath = resolveHostLogPath(pid);
    if (logPath) {
      cmd = 'tail'; args = ['-f', '-n', '80', logPath]; sourceNote = `file:${logPath}`;
    } else {
      cmd = 'journalctl'; args = [`_PID=${pid}`, '-f', '-n', '80', '-o', 'short-iso']; sourceNote = 'journalctl';
    }
  } else {
    sendLog(ws, 'error', `Unknown log source: ${kind}`);
    ws.close();
    return;
  }

  sendLog(ws, 'status', `connecting:${kind}:${idRaw}`);

  let child: ChildProcessByStdio<null, Readable, Readable>;
  try {
    child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (e: any) {
    sendLog(ws, 'error', `${cmd} unavailable: ${e.message}`);
    ws.close();
    return;
  }

  let started = false;
  const onData = (chunk: Buffer) => { started = true; sendLog(ws, 'line', stripAnsi(chunk.toString('utf8'))); };
  child.stdout.on('data', onData);
  child.stderr.on('data', onData);
  child.on('spawn', () => sendLog(ws, 'status', sourceNote ? `live:${sourceNote}` : 'live'));
  child.on('error', (err: any) => {
    sendLog(ws, 'error', `${cmd} unavailable: ${err.message}`);
    try { ws.close(); } catch {}
  });
  child.on('exit', code => {
    if (!started && code !== 0) sendLog(ws, 'error', `${cmd} exited (code ${code}) — no output`);
    sendLog(ws, 'status', 'closed');
    try { ws.close(); } catch {}
  });

  const cleanup = () => { try { child.kill(); } catch {} };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
}

// ── Interactive terminal (PTY) ───────────────────────────────────────────────
// URL: /ws-terminal?cwd=<path relative to the configured projects root>&cols&rows
// Protocol: client -> {type:'input',data} | {type:'resize',cols,rows}  (JSON text frames)
//           server -> raw binary frames = PTY output; JSON text frames for
//                      {type:'status',data} | {type:'error',data} | {type:'exit',code}
// The PTY is keyed by cwd and outlives any single connection — closing this
// socket (tab closed, dialog minimized, page reloaded) only detaches this
// viewer. A shell running `pnpm run dev` keeps running regardless; only an
// explicit POST /api/terminal/kill ends it. Reattaching replays the buffered
// output so nothing that happened while disconnected is lost.
function handleTerminalSocket(ws: WebSocket, req: http.IncomingMessage) {
  const url = new URL(req.url ?? '/', 'http://localhost');
  const relPath = url.searchParams.get('cwd') ?? '';
  const cols = parseInt(url.searchParams.get('cols') ?? '80') || 80;
  const rows = parseInt(url.searchParams.get('rows') ?? '24') || 24;

  const sendMsg = (type: string, data: unknown) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(JSON.stringify({ type, data })); } catch {}
    }
  };
  // Output is the hot path — a single fast-scrolling command can emit
  // hundreds of chunks a second. Sending it as a raw binary frame skips
  // JSON.stringify/parse (and its string-escaping cost) on both ends;
  // the client tells frames apart by type (ArrayBuffer vs. text), so no
  // envelope is needed at all. Control messages stay JSON since they're rare.
  const sendOutput = (data: string) => {
    if (ws.readyState === WebSocket.OPEN) {
      try { ws.send(Buffer.from(data, 'utf8')); } catch {}
    }
  };

  const cwd = resolveProjectPath(relPath);
  if (!cwd) {
    sendMsg('error', 'Invalid or out-of-root path');
    ws.close();
    return;
  }

  let result;
  try {
    result = getOrCreateShell(cwd, cols, rows);
  } catch (e: any) {
    sendMsg('error', `Could not start terminal: ${e.message}`);
    ws.close();
    return;
  }
  const { session, isNew } = result;

  if (session.buffer) sendOutput(session.buffer);
  sendMsg('status', isNew ? 'ready' : 'reattached');

  const onData = (data: string) => sendOutput(data);
  const onExit = ({ exitCode }: { exitCode: number }) => {
    sendMsg('exit', exitCode);
    try { ws.close(); } catch {}
  };
  const dataSub = session.proc.onData(onData);
  const exitSub = session.proc.onExit(onExit);

  ws.on('message', raw => {
    try {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'input' && typeof msg.data === 'string') session.proc.write(msg.data);
      else if (msg.type === 'resize') {
        const c = Math.max(1, parseInt(msg.cols) || 80);
        const r = Math.max(1, parseInt(msg.rows) || 24);
        session.proc.resize(c, r);
        session.cols = c; session.rows = r;
      }
    } catch {}
  });

  // Detaching never kills the shell — only this connection's own listeners.
  const cleanup = () => { dataSub.dispose(); exitSub.dispose(); };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
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
    guards: serializeGuards(),
    managed: getManagedPortMap(),
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
