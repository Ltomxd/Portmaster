
  <img src="dashboard/src/assets/raccoon.jpg" width="120" style="border-radius:50%"/>
  <h1>🦝 Portmaster</h1>
  <p><strong>Port & Process Manager for WSL / Ubuntu /windows</strong></p>
  <p>
    <a href="https://github.com/Ltomxd/Portmaster">github.com/Ltomxd/Portmaster</a>
  </p>
</div>

---

## Features

| | |
|---|---|
| ⚡ **Kill ports** | Kill Linux or Windows (WSL) processes by port |
| 🦝 **WSL-aware** | Detects processes on the Windows side that block ports, with a circuit breaker so a broken `powershell.exe` can't stall the whole dashboard |
| 🔎 **Port conflicts** | Detects *real* conflicts (two different owners on one port) — dual-stack IPv4/IPv6 or TCP+UDP from the same process no longer count as false positives |
| 🕵 **Process inspector** | Per-port security view: owning user, executable path, start time, and every active connection — external IPs flagged in red |
| 🛡 **Protect (Guard)** | Auto-kill anything that grabs a protected port, with an editable allow-list and a visible protected badge right in the process table |
| 📜 **Live logs** | Real-time log streaming for Docker containers, PM2 apps, and host processes — sessions keep running when you close the viewer, minimize to a tray, or go fullscreen |
| 🔁 **Adopt a process** | Turn an already-running host process into a live-logged one — kills and relaunches it under Portmaster's supervision, no code changes needed |
| ▶ **`portmaster dev`** | Wrap any dev command (`portmaster dev -- pnpm run dev`) to get live logs for it without adopting — your terminal output looks identical, Portmaster just also taps it |
| 📁 **Projects + Terminal** | Browse a saved projects folder from the dashboard and open a real, interactive Bash terminal (PTY-backed, Nerd Font icons and all) scoped to any subfolder — the shell persists server-side, surviving minimize, tab close, and page refresh, so a `pnpm run dev` you left running keeps going until you explicitly stop it |
| 🐳 **Docker** | List, start, stop, restart containers + port mapping + live logs |
| 🔄 **PM2** | Full PM2 integration — list, restart, stop + live logs |
| 📋 **Orchestration** | Manage multi-service stacks with `.portmaster.yaml` |
| 🌐 **Dashboard** | Real-time React web UI with WebSocket updates |
| 🌍 **i18n** | English & Spanish interface |
| 🐋 **Docker deploy** | Auto-start on machine boot via `docker compose up -d` |

---

## Install

```bash
git clone https://github.com/Ltomxd/Portmaster
cd Portmaster
bash install.sh
source ~/.bashrc
```

> **Requirements:** Node.js 18+, and `python3` + `make` + `g++` (or `build-essential`) for compiling the native terminal module (`node-pty`) on first `npm install`.

---

## Build the dashboard (first time)

```bash
cd dashboard
npm install
npm run build
cd ..
npm run dashboard
```

---

## Usage

```bash
# Start web dashboard → http://localhost:54321
portmaster dashboard

# List all active ports (Linux + Windows)
portmaster

# Kill a port
portmaster 3000

# Kill with confirmation
portmaster 3000 --safe

# List ports + Docker + PM2
portmaster list

# Guard mode
portmaster guard --port 3000 --auto-kill

# Docker management
portmaster docker

# PM2 management
portmaster pm2

# Environment info
portmaster info

# Run a dev command with live-log capture (see it in the dashboard, terminal stays normal)
portmaster dev -- pnpm run dev
portmaster dev --name api -- pnpm run start:dev
```

---

## Docker (auto-start on boot)

```bash
# Build and start
docker compose up -d

# Stop
docker compose down

# View logs
docker compose logs -f
```

The `restart: always` policy ensures Portmaster starts automatically when your machine boots.

---

## Dashboard

```
http://localhost:54321
```
```
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup
pm2 save
```

**Overview tab:**
- Stats bar: Total Processes · Active Ports · Docker · Port Conflicts · System Load
- System Resources: CPU · Memory · Disk · Uptime
- Load Averages: 1min · 5min · 15min
- Process table with search (results ranked by relevance — exact port/PID/name matches float to the top), filters (Active Only / Docker / Linux / Windows), and per-row actions: inspect, live logs, protect, kill
- Clicking **Port Conflicts** opens a breakdown of exactly which ports have more than one real owner, with kill/protect/logs actions right there

**Live logs, anywhere they show up** (Docker tab, PM2 tab, Overview rows, the conflict/inspect dialogs):
- One shared session per target — closing the log window doesn't stop it, it keeps streaming in the background; reopen it later and pick up right where you left off
- Minimize to a small tray chip, or go fullscreen
- An explicit **Terminar** button is the only thing that actually ends the underlying `docker logs -f` / `tail -f` / `journalctl -f` process
- For a bare host process (no Docker, no PM2) Portmaster first looks for a real log file behind its stdout/stderr, then falls back to `journalctl`, and explains clearly when neither exists (a process writing straight to an interactive terminal can't be tapped from outside — that's a Linux limitation, not a bug)

**Adopt a process:** for a host process already running without a live-log source, click 🔁 **Adopt** — Portmaster stops it and relaunches the exact same command with output captured, so it gets live logs from then on, exactly like a Docker/PM2 process would. Re-opening its logs later (even after closing the browser tab) reconnects instead of re-adopting.

**Inspect (🔎):** per-port security snapshot — owning user, executable path, start time, thread/memory info, and every active TCP/UDP connection on that port, with non-local remote addresses highlighted.

**Protect (🛡):** creates a guard that auto-kills anything else that binds a protected port, with an editable list of allowed process names and a check-interval preset. Protected ports show a 🛡 badge right in the table.

**Projects tab:** point it at the folder where your projects live (e.g. `/home/you/code`) — saved once, reused every time the dashboard starts. Browse into any subfolder and open a real interactive Bash terminal there (🖳), backed by an actual PTY (`node-pty`) with full color, cursor movement, and Nerd Font prompt icons — it behaves like a normal terminal because it is one. The shell lives server-side, keyed by folder, independent of the browser: minimizing it, closing the tab, or refreshing the page never kills it — reopen that same folder any time and it reattaches, replaying what happened while you were away, so something like `pnpm run dev` just keeps running. Only the explicit **Terminar** button actually ends it.

**Language:** Toggle EN / ES from the sidebar.

---
<img width="1920" height="992" alt="{5B005C77-655E-4F99-832F-FF6A28F605DC}" src="https://github.com/user-attachments/assets/8afa26ca-554c-4aed-a6d7-bc1a273eee55" />
<img width="1920" height="851" alt="{E6174E2F-69C9-40E9-8361-C2859787D42E}" src="https://github.com/user-attachments/assets/46dc6af6-b83d-4eb6-be0e-50d6b5c13202" />
<img width="1920" height="991" alt="{CE6D5C5F-831F-48AA-9AAA-9CFBA5C88B68}" src="https://github.com/user-attachments/assets/b1547e0c-d47f-40b7-bcae-d66040e21e45" />
<img width="1920" height="1004" alt="image" src="https://github.com/user-attachments/assets/420eacae-2085-4a25-a97d-b6e347e7d930" />



## License

MIT — Made by [Ltomxd](https://github.com/Ltomxd)
