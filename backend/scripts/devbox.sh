#!/usr/bin/env bash
# DEPRECATED — kept only so old muscle memory does not silently do the wrong
# thing. This script used to:
#
#   1. require bash, so on Windows it needed WSL — and with `set -e` on line 1
#      it died there before doing anything else, so no env file was created;
#   2. create `.env.development`, which the Prisma CLI never reads, so every
#      `prisma migrate` / `prisma db seed` failed with
#      "Environment variable not found: DATABASE_URL".
#
# Both problems are fixed by the cross-platform Node scripts. This file does
# nothing except point at them, and exits non-zero so a script that still calls
# it cannot pretend setup succeeded.
set -euo pipefail

cat >&2 <<'MESSAGE'
scripts/devbox.sh is deprecated and does nothing.

Run these instead — plain Node, they work on Windows without WSL:

  npm install
  npm run env:setup        # creates backend/.env with real generated secrets
  npm run db:check         # tells you exactly why Postgres/Redis are unreachable

Then get PostgreSQL running (docs/local-setup-fa.md has all three options,
simplest first):

  1. free cloud Postgres (Neon / Supabase) — nothing to install
  2. PostgreSQL 16 installed natively on Windows
  3. docker compose up -d   (needs WSL2 + virtualization enabled in BIOS)

Redis is not required locally: backend/.env ships with REDIS_URL=memory, which
runs OTP / rate limiting / locks in-process. Set it to a real redis:// URL only
when you actually have a Redis server.

Then:

  npm run prisma:migrate:dev
  npm run seed
  npm run start:dev
MESSAGE
exit 1
