#!/usr/bin/env bash
set -e

# ╔══════════════════════════════════════════════════════════════╗
# ║   Portmaster 🦝  —  Installer                               ║
# ║   github.com/Ltomxd/Portmaster                              ║
# ╚══════════════════════════════════════════════════════════════╝

CYAN='\033[0;36m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'
RED='\033[0;31m'; BOLD='\033[1m'; RESET='\033[0m'

ok()   { echo -e "  ${GREEN}✓${RESET} $1"; }
warn() { echo -e "  ${YELLOW}⚠${RESET} $1"; }
err()  { echo -e "  ${RED}✗${RESET} $1"; exit 1; }
info() { echo -e "  ${CYAN}ℹ${RESET} $1"; }

echo -e "${RED}"
cat << 'LOGO'
  ██████╗  ██████╗ ██████╗ ████████╗███╗   ███╗ █████╗ ███████╗████████╗███████╗██████╗
  ██╔══██╗██╔═══██╗██╔══██╗╚══██╔══╝████╗ ████║██╔══██╗██╔════╝╚══██╔══╝██╔════╝██╔══██╗
  ██████╔╝██║   ██║██████╔╝   ██║   ██╔████╔██║███████║███████╗   ██║   █████╗  ██████╔╝
  ██╔═══╝ ██║   ██║██╔══██╗   ██║   ██║╚██╔╝██║██╔══██║╚════██║   ██║   ██╔══╝  ██╔══██╗
  ██║     ╚██████╔╝██║  ██║   ██║   ██║ ╚═╝ ██║██║  ██║███████║   ██║   ███████╗██║  ██║
  ╚═╝      ╚═════╝ ╚═╝  ╚═╝   ╚═╝   ╚═╝     ╚═╝╚═╝  ╚═╝╚══════╝   ╚═╝   ╚══════╝╚═╝  ╚═╝
LOGO
echo -e "${RESET}"
echo -e "  ${BOLD}🦝 Port & Process Manager for WSL/Ubuntu${RESET}"
echo -e "  ${CYAN}github.com/Ltomxd/Portmaster${RESET}\n"

# ── Detect project root ───────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$SCRIPT_DIR"

if [ ! -f "$PROJECT_DIR/dist/index.js" ]; then
  err "dist/index.js not found. Make sure you're running install.sh from the portmaster folder."
fi

# ── Detect WSL ────────────────────────────────────────────────────────────────
if grep -qi microsoft /proc/sys/kernel/osrelease 2>/dev/null; then
  WSL_VER=$(uname -r | grep -oP 'WSL\d*' || echo 'WSL')
  ok "WSL detected ($WSL_VER) — Windows port scanning enabled"
fi

# ── Check Node.js ─────────────────────────────────────────────────────────────
info "Checking Node.js..."
if ! command -v node &>/dev/null; then
  err "Node.js not found. Install it: curl -fsSL https://deb.nodesource.com/setup_lts.x | sudo -E bash - && sudo apt install -y nodejs"
fi
NODE_VER=$(node --version | sed 's/v//' | cut -d. -f1)
[ "$NODE_VER" -lt 18 ] && err "Node.js $NODE_VER found, 18+ required."
ok "Node.js $(node --version)"

# ── Check optional tools ──────────────────────────────────────────────────────
command -v docker &>/dev/null && docker info &>/dev/null 2>&1 && ok "Docker available — container monitoring enabled" || warn "Docker not running (optional)"
command -v pm2 &>/dev/null && ok "PM2 available — process manager integration enabled" || warn "PM2 not found (optional, install: npm i -g pm2)"

# ── Create bin wrappers ───────────────────────────────────────────────────────
info "Installing binaries..."
mkdir -p "$HOME/.local/bin"

cat > "$HOME/.local/bin/portmaster" << WRAPPER
#!/usr/bin/env bash
exec node "${PROJECT_DIR}/dist/index.js" "\$@"
WRAPPER
chmod +x "$HOME/.local/bin/portmaster"

cat > "$HOME/.local/bin/pm" << WRAPPER
#!/usr/bin/env bash
exec node "${PROJECT_DIR}/dist/index.js" "\$@"
WRAPPER
chmod +x "$HOME/.local/bin/pm"

ok "Binary installed → $HOME/.local/bin/portmaster"

# ── Setup PATH ────────────────────────────────────────────────────────────────
SHELL_RC="$HOME/.bashrc"
[ -n "$ZSH_VERSION" ] && SHELL_RC="$HOME/.zshrc"
[ "$SHELL" = "/bin/zsh" ] || [ "$SHELL" = "/usr/bin/zsh" ] && SHELL_RC="$HOME/.zshrc"

if ! grep -q '\.local/bin' "$SHELL_RC" 2>/dev/null; then
  echo '' >> "$SHELL_RC"
  echo '# Portmaster' >> "$SHELL_RC"
  echo 'export PATH="$HOME/.local/bin:$PATH"' >> "$SHELL_RC"
fi
export PATH="$HOME/.local/bin:$PATH"
ok "PATH configured ($SHELL_RC)"

# ── Done ──────────────────────────────────────────────────────────────────────
echo ""
echo -e "  ${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo -e "  ${GREEN}${BOLD}🦝 Portmaster installed successfully!${RESET}"
echo -e "  ${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${RESET}"
echo ""
echo -e "  ${BOLD}Quick start:${RESET}"
echo ""
echo -e "    ${RED}portmaster dashboard${RESET}       # Web UI → http://localhost:4321"
echo -e "    ${RED}portmaster${RESET}                 # List all ports"
echo -e "    ${RED}portmaster 3000${RESET}            # Kill port 3000"
echo -e "    ${RED}portmaster guard -p 3000${RESET}   # Watch port 3000"
echo -e "    ${RED}portmaster info${RESET}            # Show environment info"
echo ""
echo -e "  ${BOLD}Docker (auto-start on boot):${RESET}"
echo -e "    ${CYAN}docker compose up -d${RESET}       # Start with Docker"
echo ""
echo -e "  ${YELLOW}Reload shell:${RESET} source ~/.bashrc  (or open a new terminal)"
echo ""
