#!/usr/bin/env node
/**
 * Preflight check: are PostgreSQL and Redis actually reachable?
 *
 *   npm run db:check
 *
 * Deliberately dependency-free (plain `node:net` sockets) so it runs before
 * Prisma is usable, and reports the real reason a connection failed instead of
 * Prisma's generic P1001/P1012. ECONNREFUSED and ETIMEDOUT have completely
 * different causes and completely different fixes, so they are told apart here.
 *
 * Exit code: 0 when everything needed is reachable, 1 otherwise.
 */
import { lookup } from 'node:dns/promises';
import { existsSync, readFileSync } from 'node:fs';
import { connect } from 'node:net';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const TIMEOUT_MS = 5000;

/**
 * Load env files the way `prisma.config.ts` does: `.env` first, then the
 * per-environment file, and anything already in `process.env` wins.
 */
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
loadEnv(join(root, `.env.${process.env.NODE_ENV ?? 'development'}`));

/** Raw TCP connect — the only thing needed to prove a port is listening. */
function probe(host, port) {
  return new Promise((resolve) => {
    const socket = connect({ host, port });
    const timer = setTimeout(() => {
      socket.destroy();
      resolve({ ok: false, code: 'ETIMEDOUT' });
    }, TIMEOUT_MS);

    socket.once('connect', () => {
      clearTimeout(timer);
      socket.end();
      resolve({ ok: true });
    });
    socket.once('error', (error) => {
      clearTimeout(timer);
      socket.destroy();
      resolve({ ok: false, code: error.code ?? 'ERROR', message: error.message });
    });
  });
}

/** What `localhost` resolves to here — explains most IPv4/IPv6 surprises. */
async function addressesOf(host) {
  if (/^\d+$/.test(host.replace(/\./g, '')) || host.includes(':')) return null; // already an IP
  try {
    const found = await lookup(host, { all: true });
    return found.map((entry) => entry.address);
  } catch {
    return null;
  }
}

/** Human explanation per failure code, with the fix that matches it. */
function explain(code, { host, port, service }) {
  const lines = [];

  switch (code) {
    case 'ECONNREFUSED':
      lines.push(
        `ECONNREFUSED — the machine answered, but nothing is listening on ${host}:${port}.`,
      );
      lines.push('');
      lines.push(`  Most likely ${service} is not running, or is on a different port.`);
      lines.push('  On Windows there is a second, quieter cause: "localhost" can resolve to');
      lines.push('  IPv6 (::1) first while the server only listens on IPv4. Put 127.0.0.1 in');
      lines.push('  backend/.env instead of localhost and try again.');
      break;
    case 'ETIMEDOUT':
      lines.push(
        `ETIMEDOUT — nothing refused the connection; no answer at all within ${TIMEOUT_MS / 1000}s.`,
      );
      lines.push('');
      lines.push('  Packets are being dropped rather than rejected. Typical causes:');
      lines.push('  - a firewall (Windows Defender, corporate network) blocking the port');
      lines.push('  - a cloud host that is not reachable from this network / needs a VPN');
      lines.push('  - a cloud provider IP allowlist that does not include your address');
      lines.push('  This is NOT the "server is down" case — that one is ECONNREFUSED.');
      break;
    case 'ENOTFOUND':
      lines.push(`ENOTFOUND — the hostname "${host}" does not resolve.`);
      lines.push('');
      lines.push('  Check it for typos against the connection string your provider gave you.');
      break;
    default:
      lines.push(`${code} — the connection failed.`);
  }

  return lines;
}

async function check({ label, url, defaultPort, service, required }) {
  let parsed;
  try {
    parsed = new URL(url);
  } catch {
    console.log(`✗ ${label}: ${url} is not a valid URL.`);
    return false;
  }

  const host = parsed.hostname || 'localhost';
  const port = Number(parsed.port || defaultPort);
  const resolved = await addressesOf(host);

  console.log(`==> ${label}: ${host}:${port}`);
  if (resolved?.length) console.log(`    "${host}" resolves to: ${resolved.join(', ')}`);

  let result = await probe(host, port);

  // Diagnostic retry: if `localhost` failed but the IPv4 literal works, the
  // problem is address-family selection, not a dead server. Say so precisely.
  if (!result.ok && host === 'localhost') {
    const ipv4 = await probe('127.0.0.1', port);
    if (ipv4.ok) {
      console.log(`✗ ${service} is not reachable as "${host}", but IS on 127.0.0.1:${port}.`);
      console.log('');
      console.log('  That is the Windows IPv6 case: "localhost" resolved to ::1, which');
      console.log(`  ${service} is not listening on, while IPv4 works fine.`);
      console.log(`  Fix: replace localhost with 127.0.0.1 in backend/.env.`);
      console.log('');
      return false;
    }
  }

  if (result.ok) {
    console.log(`✓ ${service} is accepting connections.`);
    console.log('');
    return true;
  }

  console.log(`✗ ${service} is not reachable at ${host}:${port}`);
  console.log('');
  for (const line of explain(result.code, { host, port, service })) console.log(`  ${line}`.trimEnd());
  console.log('');

  if (!required) {
    console.log('  Redis has no official Windows build. To skip it entirely for local');
    console.log('  development, set this in backend/.env:');
    console.log('      REDIS_URL=memory');
    console.log('  OTP, rate limiting and locks then run in-process (dev only — single');
    console.log('  process, nothing persists). See docs/local-setup-fa.md.');
    console.log('');
  }

  return false;
}

// --- PostgreSQL (hard requirement: the app cannot run without it) ------------

const databaseUrl = process.env.DATABASE_URL;

if (!databaseUrl) {
  console.error('✗ DATABASE_URL is not set.');
  console.error('');
  console.error('  There is no .env file in backend/ yet. Create one with:');
  console.error('      npm run env:setup');
  console.error('');
  console.error('  (The Prisma CLI only reads a file named exactly `.env`, which is why');
  console.error('   that script writes `.env` rather than `.env.development`.)');
  process.exit(1);
}

const dbOk = await check({
  label: 'DATABASE_URL',
  url: databaseUrl,
  defaultPort: 5432,
  service: 'PostgreSQL',
  required: true,
});

// --- Redis (only probed when a real server is configured) --------------------

const redisUrl = process.env.REDIS_URL ?? 'redis://127.0.0.1:6379/0';
let redisOk = true;

if (redisUrl === 'memory') {
  console.log('==> REDIS_URL=memory');
  console.log('✓ Using the in-process Redis stand-in — nothing to connect to.');
  console.log('  OTP, rate limiting and locks work, but only inside this process and');
  console.log('  only until it restarts. Fine for development, never for production.');
  console.log('');
} else {
  redisOk = await check({
    label: 'REDIS_URL',
    url: redisUrl,
    defaultPort: 6379,
    service: 'Redis',
    required: false,
  });
}

// --- verdict -----------------------------------------------------------------

if (!dbOk || !redisOk) {
  if (!dbOk) {
    console.error('PostgreSQL is required — see the three options for getting one running');
    console.error('in docs/local-setup-fa.md (cloud, native Windows install, or Docker).');
    console.error('');
  }
  console.error('Not ready yet. Fix the above and run `npm run db:check` again.');
  process.exit(1);
}

console.log('✓ Ready. Next:  npm run prisma:migrate:dev  &&  npm run seed  &&  npm run start:dev');
