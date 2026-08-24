#!/usr/bin/env node
/**
 * Preflight check: is DATABASE_URL set, and is PostgreSQL actually reachable?
 *
 *   npm run db:check
 *
 * Runs a raw TCP connect against the host/port in DATABASE_URL. Deliberately
 * dependency-free so it works before the database (or Prisma) is usable, and
 * gives a precise reason instead of Prisma's generic P1012/P1001.
 */
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Load .env the same way the Prisma CLI does (plain KEY=VALUE, existing env wins). */
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

const url = process.env.DATABASE_URL;

if (!url) {
  console.error('✗ DATABASE_URL is not set.');
  console.error('');
  console.error('  There is no .env file in backend/ yet. Create one with:');
  console.error('      npm run env:setup');
  process.exit(1);
}

let parsed;
try {
  parsed = new URL(url);
} catch {
  console.error(`✗ DATABASE_URL is not a valid URL: ${url}`);
  process.exit(1);
}

const host = parsed.hostname || 'localhost';
const port = Number(parsed.port || 5432);
const database = parsed.pathname.replace(/^\//, '') || '(none)';

console.log(`==> DATABASE_URL found: ${host}:${port}/${database}`);

const socket = connect({ host, port });
const timer = setTimeout(() => {
  socket.destroy();
  fail('timed out after 5s');
}, 5000);

function fail(reason) {
  console.error(`✗ Cannot reach PostgreSQL at ${host}:${port} — ${reason}`);
  console.error('');
  console.error('  Is the database running? Start it with:');
  console.error('      docker compose up -d');
  console.error('');
  console.error('  No Docker? Install PostgreSQL 16 natively, create the database,');
  console.error('  and point DATABASE_URL in backend/.env at it.');
  process.exit(1);
}

socket.on('connect', () => {
  clearTimeout(timer);
  socket.end();
  console.log('✓ PostgreSQL is accepting connections.');
  console.log('');
  console.log('Next:  npm run prisma:migrate:dev');
});

socket.on('error', (error) => {
  clearTimeout(timer);
  fail(error.code ?? error.message);
});
