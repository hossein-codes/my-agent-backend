# syntax=docker/dockerfile:1
# Multi-stage production image — non-root, healthchecked (spec §3, §47).

# ---------- deps: install node_modules (cached layer) ----------
FROM node:20-bookworm-slim AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
# Install ALL deps (needed to run `prisma generate`), then prune later.
RUN npm ci || npm install
RUN npx prisma generate

# ---------- build ----------
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

# ---------- prod dependencies only ----------
FROM node:20-bookworm-slim AS prod-deps
WORKDIR /app
COPY package.json package-lock.json* ./
COPY prisma ./prisma
RUN npm ci --omit=dev || npm install --omit=dev
RUN npx prisma generate

# ---------- runtime ----------
FROM node:20-bookworm-slim AS runner
ENV NODE_ENV=production
WORKDIR /app
RUN groupadd -r app && useradd -r -g app app

COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY prisma ./prisma
COPY package.json ./

RUN mkdir -p /app/uploads && chown -R app:app /app
USER app

EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/api/v1/health/live').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# Migrations run as a separate step (`docker run --rm app npx prisma migrate deploy`)
# before app start, so container start = pure deploy.
CMD ["node", "dist/main.js"]
