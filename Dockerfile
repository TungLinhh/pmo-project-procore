# PMO MVP - Multi-stage Dockerfile
# Stage 1: Build frontend (Vite)
# Stage 2: Runtime backend (Express serves API + frontend/dist)
# NOTE: node:22-slim chosen over node:20-alpine for better glibc compatibility
# with native-ish deps (pg/xlsx/multer are pure JS, but 22-slim is safer).
# Local runs node v26 — no engines field in any package.json, so 22 works.

FROM node:22-slim AS frontend-build

WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci --no-audit --no-fund
COPY frontend/ ./frontend/
RUN npm run build

# Stage 2: Backend runtime
FROM node:22-slim

RUN apt-get update && apt-get install -y --no-install-recommends \
    bash tini postgresql-client \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Backend deps (production only)
COPY backend/package*.json ./backend/
RUN cd backend && npm ci --omit=dev --no-audit --no-fund

# Backend source + drizzle migrations
COPY backend/ ./backend/

# Built frontend (served same-origin by Express)
COPY --from=frontend-build /app/frontend/dist ./frontend/dist

# Runtime dirs are writable only by the unprivileged runtime user.
RUN mkdir -p /app/backend/uploads /app/backend/data/backups /app/data \
    && chown -R node:node /app/backend/uploads /app/backend/data /app/data

# Runtime configuration comes from the deployment environment. No database
# password or other secret is baked into the image.
ENV NODE_ENV=production \
    PORT=3000 \
    UPLOADS_DIR=/app/backend/uploads \
    BACKUP_DIR=/app/backend/data/backups

EXPOSE 3000

# Healthcheck — node is always present (wget is NOT installed in this image).
HEALTHCHECK --interval=30s --timeout=5s --retries=3 \
  CMD node -e "fetch('http://localhost:3000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Entrypoint: wait for PG → init-db (idempotent) → exec CMD
COPY docker-entrypoint.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/docker-entrypoint.sh

ENTRYPOINT ["/usr/bin/tini", "--", "/usr/local/bin/docker-entrypoint.sh"]
USER node
CMD ["node", "backend/src/index.js"]