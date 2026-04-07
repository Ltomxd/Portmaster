# ─────────────────────────────────────────────────────────────
#  Portmaster 🦝  —  by Ltomxd
#  github.com/Ltomxd/Portmaster
# ─────────────────────────────────────────────────────────────
FROM node:20-alpine

LABEL maintainer="Ltomxd" \
      description="Portmaster — WSL/Ubuntu Port & Process Manager" \
      version="1.0.0"

WORKDIR /app

# Install production deps
COPY package*.json ./
RUN npm install --omit=dev --silent

# Copy compiled backend
COPY dist/ ./dist/

# Copy built React dashboard
COPY dashboard/dist/ ./dashboard/dist/

EXPOSE 4321

HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD wget -qO- http://localhost:4321/api/ports || exit 1

CMD ["node", "dist/index.js", "dashboard", "--host", "0.0.0.0", "--port", "4321"]
