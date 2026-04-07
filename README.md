<div align="center">
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
| 🦝 **WSL-aware** | Detects processes on the Windows side that block ports |
| 🛡 **Guard mode** | Watch ports and auto-kill intruders |
| 🐳 **Docker** | List, start, stop, restart containers + port mapping |
| 🔄 **PM2** | Full PM2 integration — list, restart, stop |
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

> **Requirements:** Node.js 18+

---

## Build the dashboard (first time)

```bash
cd dashboard
npm install
npm run build
cd ..
```

---

## Usage

```bash
# Start web dashboard → http://localhost:4321
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
http://localhost:4321
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
- Process table with search + filter (Active Only / Linux / Windows)

**Language:** Toggle EN / ES from the sidebar.

---

## License

MIT — Made by [Ltomxd](https://github.com/Ltomxd)
