<img width="1920" height="1004" alt="image" src="https://github.com/user-attachments/assets/e2be1b14-ed4b-455f-b32f-dac537e5ec8a" /><div align="center">
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
npm run dashboard
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
<img width="1920" height="992" alt="{5B005C77-655E-4F99-832F-FF6A28F605DC}" src="https://github.com/user-attachments/assets/8afa26ca-554c-4aed-a6d7-bc1a273eee55" />
<img width="1920" height="991" alt="{CE6D5C5F-831F-48AA-9AAA-9CFBA5C88B68}" src="https://github.com/user-attachments/assets/b1547e0c-d47f-40b7-bcae-d66040e21e45" />
<img width="1920" height="1004" alt="image" src="https://github.com/user-attachments/assets/420eacae-2085-4a25-a97d-b6e347e7d930" />



## License

MIT — Made by [Ltomxd](https://github.com/Ltomxd)
