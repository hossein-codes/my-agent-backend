#!/usr/bin/env bash
# Local development setup.
#
#   npm run infra:setup   → starts Postgres + Redis and creates .env.development
#
# Idempotent: safe to re-run. Never touches an existing .env.development.
set -euo pipefail

cd "$(dirname "$0")/.."

echo "==> Checking prerequisites"
command -v docker >/dev/null 2>&1 || { echo "docker is required but not on PATH" >&2; exit 1; }
command -v node   >/dev/null 2>&1 || { echo "node is required but not on PATH" >&2; exit 1; }

echo "==> Starting Postgres and Redis"
docker compose up -d

echo "==> Waiting for Postgres to accept connections"
for i in $(seq 1 30); do
  if docker compose exec -T postgres pg_isready -U fashion -d fashion_dev >/dev/null 2>&1; then
    echo "    Postgres is ready"
    break
  fi
  [ "$i" -eq 30 ] && { echo "Postgres did not become ready in time" >&2; exit 1; }
  sleep 1
done

if [ ! -f .env.development ]; then
  echo "==> Creating .env.development from .env.example"
  cp .env.example .env.development
  # Generate real secrets instead of leaving the change-me placeholders.
  for key in JWT_ACCESS_SECRET OTP_HASH_PEPPER AUDIT_HASH_KEY DATA_ENCRYPTION_KEY ADMIN_BOOTSTRAP_SECRET; do
    secret="$(openssl rand -hex 32)"
    # Portable in-place edit (macOS sed needs the '' argument).
    if sed --version >/dev/null 2>&1; then
      sed -i "s|^${key}=.*|${key}=${secret}|" .env.development
    else
      sed -i '' "s|^${key}=.*|${key}=${secret}|" .env.development
    fi
  done
  echo "    generated fresh secrets for JWT/OTP/AUDIT/ENCRYPTION/BOOTSTRAP"
else
  echo "==> .env.development already exists — leaving it untouched"
fi

echo "==> Installing dependencies"
npm install

echo "==> Generating the Prisma client"
npm run prisma:generate

echo
echo "Setup complete. Next:"
echo "  npm run prisma:migrate:dev   # create/apply migrations (none exist yet)"
echo "  npm run seed                 # load RBAC + reference catalog data"
echo "  npm run start:dev            # start the API on :3000 (docs at /docs)"
