#!/usr/bin/env node
/**
 * Cross-platform environment bootstrap (Windows / macOS / Linux — no bash, no WSL).
 *
 *   npm run env:setup
 *
 * Creates `.env` from `.env.example`, replacing every `change-me*` placeholder
 * secret with a real 32-byte random hex value.
 *
 * Why `.env` and not `.env.development`?
 *   The Prisma CLI (`prisma migrate`, `prisma db seed`, `prisma studio`) only
 *   ever auto-loads a file literally named `.env`. NestJS loads
 *   `.env.<NODE_ENV>` first and then falls back to `.env`, so a single `.env`
 *   satisfies both. Using `.env.development` breaks every Prisma command with
 *   "Environment variable not found: DATABASE_URL".
 *
 * Idempotent: an existing `.env` is never overwritten.
 */
import { randomBytes } from 'node:crypto';
import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const target = join(root, '.env');
const template = join(root, '.env.example');

/** Secrets that must never keep their placeholder value. */
const SECRET_KEYS = [
  'JWT_ACCESS_SECRET',
  'OTP_HASH_PEPPER',
  'AUDIT_HASH_KEY',
  'DATA_ENCRYPTION_KEY',
  'ADMIN_BOOTSTRAP_SECRET',
];

if (existsSync(target)) {
  console.log('==> .env already exists — leaving it untouched.');
  process.exit(0);
}

if (!existsSync(template)) {
  console.error('.env.example is missing — cannot bootstrap the environment.');
  process.exit(1);
}

copyFileSync(template, target);

let contents = readFileSync(target, 'utf8');
for (const key of SECRET_KEYS) {
  const secret = randomBytes(32).toString('hex');
  // Replace the whole line so trailing "# comment" placeholders go away too.
  contents = contents.replace(new RegExp(`^${key}=.*$`, 'm'), `${key}=${secret}`);
}
writeFileSync(target, contents);

console.log('==> Created .env from .env.example');
console.log(`    generated real secrets for: ${SECRET_KEYS.join(', ')}`);
console.log('');
console.log('Next: point DATABASE_URL in .env at a PostgreSQL you can reach.');
console.log('  easiest  free cloud Postgres (neon.com) — nothing to install');
console.log('  or       docker compose up -d');
console.log('');
console.log('Then:');
console.log('  npm run db:check              # verify the connection');
console.log('  npm run prisma:migrate:dev    # create and apply the first migration');
console.log('  npm run seed');
console.log('  npm run start:dev');
console.log('');
console.log('Redis is not needed: .env ships with REDIS_URL=memory.');
