
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
| 📁 **Projects + Terminal** | Browse a saved projects folder from the dashboard and open a real, interactive Bash terminal (Nerd Font icons, GPU-rendered) scoped to any subfolder — backed by a detached `tmux` session per folder, so a `pnpm run dev` you left running survives minimize, tab close, page refresh, *and even a dashboard restart*, until you explicitly stop it |
| 🐳 **Docker** | List, start, stop, restart containers + port mapping + live logs |
| 🔄 **PM2** | Full PM2 integration — list, restart, stop + live logs |
| 📋 **Orchestration** | Manage multi-service stacks with `.portmaster.yaml` |
| 🌐 **Dashboard** | Real-time React web UI with WebSocket updates |
| 🌍 **i18n** | English & Spanish interface |
| 🐋 **Docker deploy** | Auto-start on machine boot via `docker compose up -d` |
| 🕐 **Live clock** | Auto-detects your timezone, ticks every second, click to toggle 12h/24h |
| ★ **Favorites** | Pin ports and project folders so they float to the top of their lists |
| ⚡ **Saved commands** | One-click buttons per project folder (`pnpm dev`, `docker compose up`, …) that run in that folder's terminal |
| ⊞ **Split terminal** | Open a second terminal alongside the active one — two folders' shells side by side |
| 📝 **.env editor** | Read and write a folder's `.env` right from the Projects tab, no editor needed |
| ⭳ **Export / import config** | Back up favorites, saved commands, and your projects root as one JSON file |
| 📊 **Per-process CPU / Mem** | Live resource usage in the process table, computed from `/proc` deltas |
| 📈 **Resource history** | Hoverable sparkline trend for CPU / Memory / Disk, useful for spotting a slow leak |
| 🔔 **Notifications** | Opt-in toast + browser notification when a Guard kills something, an adopted process stops, or a new port conflict appears |
| 📋 **Audit log** | Persistent record of every kill, Guard action, and adoption, with timestamps |
| ♻ **Auto-restart** | Opt-in, per adopted process — relaunches it if it crashes, with crash-loop protection; never restarts one you stopped on purpose |
| 🔒 **Password protection** | Off by default; set a password from the sidebar to gate the whole dashboard (API + WebSocket) behind a login screen |
| 🔍 **Command palette** | `Ctrl/Cmd+K` — jump to a tab, kill a port, or open a favorite project's terminal without leaving the keyboard |

---

## Install

```bash
git clone https://github.com/Ltomxd/Portmaster
cd Portmaster
bash install.sh
source ~/.bashrc
```

> **Requirements:** Node.js 18+; `python3` + `make` + `g++` (or `build-essential`) for compiling the native terminal module (`node-pty`) on first `npm install`; and `tmux` (`sudo apt install tmux`) — the Projects tab's terminals run as detached tmux sessions so they survive not just a closed browser tab but a dashboard restart too.

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
http://localhost:54321

"estar wsl "
sudo env PATH="$PATH:/home/kira/.nvm/versions/node/v25.2.1/bin" /home/kira/.nvm/versions/node/v25.2.1/lib/node_modules/pm2/bin/pm2 startup systemd -u kira --hp /home/kira

sudo nano /etc/wsl.conf

[boot]
systemd=true

PowerShell: wsl --shutdown

pm2 status
```
<img width="1231" height="211" alt="{B721B5D6-17EC-43F1-97F7-9D0E031B43D1}" src="https://github.com/user-attachments/assets/7235ddac-1622-4065-9b33-64253198e09b" />


<img width="1514" height="205" alt="{938B1DD6-A54B-4E8F-854D-51A8E1C79F18}" src="https://github.com/user-attachments/assets/7b1b2868-1496-493f-a59c-237a897c0676" />

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

**Projects tab:** point it at the folder where your projects live (e.g. `/home/you/code`) — saved once, reused every time the dashboard starts. Browse into any subfolder and open a real interactive Bash terminal there (🖳), rendered with `@xterm/xterm` (GPU-accelerated via WebGL when available) over a raw binary WebSocket for lag-free typing and output. Each terminal is backed by a detached `tmux` session, one per folder — not just a PTY owned by the dashboard process — so minimizing it, closing the tab, refreshing the page, *or the dashboard itself restarting* never touches what's running inside: leave `pnpm run dev` going and it keeps going, full stop. A green "Running" indicator marks any folder with a live session, and its tray chip survives a reload too. Only the explicit **Terminar** button (`tmux kill-session`) actually ends it.
- **⊞ Split** opens a second terminal alongside the current one instead of replacing it — handy for watching a backend and frontend dev server at once.
- **★** on any folder pins it to the top of the list; the same star on a port row in Overview does the same there.
- **+ Add command** saves a one-click button (a label and a shell command) scoped to that folder — click it and it opens/reuses that folder's terminal and runs the command for you.
- **📝 .env** opens a small editor for that folder's `.env` file (hidden from the regular listing on purpose) — read, edit, save, no need to open a real editor for a one-line change.

**System resources:** CPU / Memory / Disk cards now carry a small hoverable trend line under the percentage bar — the last ~6 minutes at the dashboard's poll rate, enough to notice a memory leak creeping up without needing an external monitoring tool. The process table also shows live CPU % and memory (MB) per row, computed from `/proc/<pid>/stat` deltas.

**Command palette:** `Ctrl+K` (or the search button in the header) opens a fuzzy search over tabs, active ports (search + kill), and favorite projects (search + open terminal) — everything in one box, arrow keys to move, Enter to run.

**Notifications:** click 🔔 in the header once to grant permission; from then on a Guard actually killing something, a managed process disappearing, or a fresh port conflict raises both an in-app toast and a real OS notification (so it's visible even if the tab isn't focused). Nothing fires until you opt in.

**Audit log:** every kill, Guard auto-kill, and adoption is timestamped and kept (last 500) in `~/.portmaster/audit.json` — open it from **📋 Audit Log** in the sidebar.

**Auto-restart:** on an adopted (managed) process's row, click ♻ to have Portmaster relaunch it automatically if it crashes — off by default, since restarting something you meant to stop would be a bug, not a feature. A process you kill from the dashboard is recognized as intentional and never auto-restarts; five rapid crashes in a row and it gives up rather than loop forever.

**Password protection:** off by default — this is a local dev dashboard, not a public service. Set a password from **🔒 Set password** in the sidebar to gate every API route and the WebSocket behind a login screen; useful if the dashboard is ever reachable beyond `localhost` (WSL's `0.0.0.0` bind makes that easier to do by accident than it sounds).

**Backup:** **⭳ Export** / **⭱ Import** in the sidebar round-trip your favorites, saved commands, and projects root as a single JSON file — the password hash never leaves the server, so it's safe to share.

**Language:** Toggle EN / ES from the sidebar.

---
<img width="1920" height="992" alt="{5B005C77-655E-4F99-832F-FF6A28F605DC}" src="https://github.com/user-attachments/assets/8afa26ca-554c-4aed-a6d7-bc1a273eee55" />
<img width="1920" height="851" alt="{E6174E2F-69C9-40E9-8361-C2859787D42E}" src="https://github.com/user-attachments/assets/46dc6af6-b83d-4eb6-be0e-50d6b5c13202" />
<img width="1920" height="991" alt="{CE6D5C5F-831F-48AA-9AAA-9CFBA5C88B68}" src="https://github.com/user-attachments/assets/b1547e0c-d47f-40b7-bcae-d66040e21e45" />
<img width="1920" height="1004" alt="image" src="https://github.com/user-attachments/assets/420eacae-2085-4a25-a97d-b6e347e7d930" />



## License
> Inspired by [port-kill](https://github.com/treadiehq/port-kill)
> by treadiehq. This is an independent reimplementation built from
> scratch in a different stack, targeting WSL/Linux environments.
MIT — Made by [Ltomxd](https://github.com/Ltomxd)
