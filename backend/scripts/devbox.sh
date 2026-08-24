#!/usr/bin/env bash
# DEPRECATED — kept only so old muscle memory does not silently do the wrong
# thing. This script used to create `.env.development`, which the Prisma CLI
# never reads, so every `prisma migrate` / `prisma db seed` failed with
# "Environment variable not found: DATABASE_URL".
#
# Use the cross-platform Node scripts instead (they work on Windows without
# WSL, which this bash script does not):
#
#   npm run env:setup    → create .env with real secrets
#   docker compose up -d → start PostgreSQL + Redis
#   npm run db:check     → verify the database is reachable
set -euo pipefail

cat >&2 <<'MESSAGE'
scripts/devbox.sh is deprecated and does nothing.

Run these instead (all cross-platform, no WSL needed):

  npm run env:setup      # creates backend/.env with real generated secrets
  docker compose up -d   # starts PostgreSQL + Redis
  npm run db:check       # confirms PostgreSQL is reachable
  npm run prisma:migrate:dev
  npm run seed
  npm run start:dev
MESSAGE
exit 1
