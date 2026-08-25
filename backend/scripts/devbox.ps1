# DEPRECATED - kept only so old muscle memory does not silently do the wrong thing.
#
# This script used to hard-require Docker Desktop (which needs WSL2) and to
# create `.env.development`. That filename is the bug: the Prisma CLI only ever
# reads a file named exactly `.env`, so `prisma migrate dev` and `prisma db seed`
# failed with "Environment variable not found: DATABASE_URL".
#
# The cross-platform Node scripts replaced it. This file does nothing except
# point at them, and exits non-zero so nothing can treat it as a successful setup.

Write-Host @'
scripts/devbox.ps1 is deprecated and does nothing.

Run these instead - plain Node, no Docker and no WSL needed:

  npm install
  npm run env:setup        # creates backend/.env with real generated secrets
  npm run db:check         # tells you exactly why Postgres/Redis are unreachable

Then get PostgreSQL running (docs/local-setup-fa.md, simplest first):

  1. free cloud Postgres (Neon / Supabase) - nothing to install
  2. PostgreSQL 16 installed natively on Windows
  3. docker compose up -d  (needs WSL2 + virtualization enabled in BIOS)

Redis is not required locally: backend/.env ships with REDIS_URL=memory, which
runs OTP / rate limiting / locks in-process.

Then:

  npm run prisma:migrate:dev
  npm run seed
  npm run start:dev
'@ -ForegroundColor Yellow

exit 1
