#!/usr/bin/env node
/**
 * Preflight check: are PostgreSQL and Redis reachable at the URLs in .env?
 *
 *   npm run db:check
 *
 * Raw TCP connects only — deliberately dependency-free so it works before the
 * database (or the Prisma client) is usable, and reports a precise reason
 * instead of Prisma's generic P1001.
 */
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Load .env the same way the Prisma CLI does (plain KEY=VALUE, real env wins). */
function loadEnv(file) {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
    if (!match) continue;
    if (process.env[match[1]]) continue;
    const raw = match[2].trim();
    const quoted = /^(['"])([\s\S]*)\1$/.exec(raw);
    process.env[match[1]] = quoted ? quoted[2] : raw.replace(/\s+#.*$/, '').trim();
  }
}

loadEnv(join(root, '.env'));

/** Resolve a TCP endpoint from a URL-shaped env var. */
function endpoint(value, defaultPort) {
  const url = new URL(value);
  return {
    host: url.hostname || '127.0.0.1',
    port: Number(url.port || defaultPort),
    path: url.pathname.replace(/^\//, ''),
  };
}

function probe(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve('ETIMEDOUT');
    }, timeoutMs);
    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve(null);
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      resolve(error.code ?? error.message);
    });
  });
}

function explain(reason, host) {
  if (reason === 'ETIMEDOUT') {
    console.error('    ETIMEDOUT means the packet went out and nothing answered.');
    if (host === 'localhost') {
      console.error('    On Windows "localhost" often resolves to IPv6 ::1 first while the');
      console.error('    server only listens on IPv4 — try 127.0.0.1 in the URL instead.');
    }
    console.error('    A firewall or VPN can also swallow the connection.');
  } else if (reason === 'ECONNREFUSED') {
    console.error('    ECONNREFUSED means nothing is listening on that port — the');
    console.error('    server simply is not running.');
  }
}

const failures = [];

// --- PostgreSQL (required) ---------------------------------------------------
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) {
  console.error('✗ DATABASE_URL is not set — there is no .env yet.');
  console.error('    Run: npm run env:setup');
  process.exit(1);
}

const db = endpoint(databaseUrl, 5432);
console.log(`==> PostgreSQL  ${db.host}:${db.port}/${db.path}`);
const dbFailure = await probe(db.host, db.port);
if (dbFailure) {
  console.error(`✗ unreachable — ${dbFailure}`);
  explain(dbFailure, db.host);
  failures.push('postgres');
} else {
  console.log('✓ accepting connections');
}

// --- Redis (needed for OTP login, rate limits and locks) ---------------------
const redisUrl = process.env.REDIS_URL;
if (redisUrl === 'memory') {
  console.log('==> Redis       in-memory store (REDIS_URL=memory) — nothing to install');
} else if (redisUrl) {
  const redis = endpoint(redisUrl, 6379);
  console.log(`==> Redis       ${redis.host}:${redis.port}`);
  const redisFailure = await probe(redis.host, redis.port, 3000);
  if (redisFailure) {
    console.error(`✗ unreachable — ${redisFailure}`);
    explain(redisFailure, redis.host);
    console.error('    The API still boots, but OTP login returns 503 without Redis.');
    console.error('    To avoid installing Redis, set REDIS_URL=memory in .env');
    failures.push('redis');
  } else {
    console.log('✓ accepting connections');
  }
}

console.log('');
if (failures.includes('postgres')) {
  console.error('PostgreSQL is required. Easiest first:');
  console.error('    1. free cloud Postgres (Neon/Supabase) — nothing to install,');
  console.error('       just paste the connection string into DATABASE_URL in .env');
  console.error('    2. docker compose up -d           (needs Docker Desktop + WSL2)');
  console.error('    3. a native PostgreSQL 16 install (no Docker)');
  console.error('    See docs/local-setup-fa.md');
  process.exit(1);
}

if (failures.length) {
  console.error('PostgreSQL is up but Redis is not. You can migrate and seed now,');
  console.error('and start Redis before testing the login flow.');
  process.exit(1);
}

console.log('All services are up. Next:  npm run prisma:migrate:dev');
