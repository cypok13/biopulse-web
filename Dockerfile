# ── Build stage ──────────────────────────────────────────────────────────────
FROM node:22-alpine AS builder

WORKDIR /build

# Copy package files and install deps (including devDeps for tsc)
COPY bot/package*.json ./bot/
RUN cd bot && npm ci

# Copy source
COPY shared/ ./shared/
COPY bot/src/ ./bot/src/
COPY bot/tsconfig.json ./bot/

# Compile TypeScript (rootDir=".." so output mirrors the full tree under bot/dist/)
RUN cd bot && npx tsc

# ── Runtime stage ─────────────────────────────────────────────────────────────
FROM node:22-alpine

WORKDIR /app

# Install only production deps
COPY bot/package*.json ./bot/
RUN cd bot && npm ci --omit=dev

# Copy compiled output + shared source (used at runtime via symlink in postbuild)
COPY --from=builder /build/bot/dist/ ./bot/dist/
COPY shared/ ./shared/

# postbuild symlink: bot/dist/bot/shared -> /app/shared
# (tsc compiles shared/ to bot/dist/shared/ already — no symlink needed in Docker)

ENV NODE_ENV=production

CMD ["node", "bot/dist/bot/src/index.js"]
