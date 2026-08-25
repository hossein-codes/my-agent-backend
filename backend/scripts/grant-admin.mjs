#!/usr/bin/env node
/**
 * Grant a role to an existing user, by phone number.
 *
 *   npm run admin:grant -- +989120000002
 *   npm run admin:grant -- +989120000002 PRODUCT_MANAGER
 *
 * Why this exists: `prisma db seed` creates only a demo CUSTOMER, and every
 * admin endpoint requires `products.write` (PRODUCT_MANAGER or SUPER_ADMIN).
 * Without this the first thing an admin UI does is 403, which looks like a
 * bug rather than a missing role.
 *
 * The user must already exist — log in once via OTP first, so the account is
 * created by the real auth flow rather than hand-written here.
 *
 * Idempotent: re-running reports the role is already present and changes
 * nothing.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Same precedence as prisma.config.ts: real env → .env → .env.<NODE_ENV> */
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

const [rawPhone, rawRole] = process.argv.slice(2);
const roleSlug = (rawRole ?? 'SUPER_ADMIN').toUpperCase();

if (!rawPhone) {
  console.error('Usage: npm run admin:grant -- <phone> [ROLE_SLUG]');
  console.error('Example: npm run admin:grant -- +989120000002');
  console.error('Default role: SUPER_ADMIN');
  process.exit(1);
}

/**
 * Accepts 09121112233, 9121112233, 00989121112233 or +989121112233 and
 * normalises to E.164, matching how the auth module stores phone numbers.
 */
function toE164(input) {
  const digits = input.replace(/[\s-()]/g, '');
  if (/^\+98\d{10}$/.test(digits)) return digits;
  if (/^0098\d{10}$/.test(digits)) return `+98${digits.slice(4)}`;
  if (/^98\d{10}$/.test(digits)) return `+${digits}`;
  if (/^0\d{10}$/.test(digits)) return `+98${digits.slice(1)}`;
  if (/^9\d{9}$/.test(digits)) return `+98${digits}`;
  return null;
}

const phone = toE164(rawPhone);
if (!phone) {
  console.error(`✗ "${rawPhone}" is not a valid Iranian mobile number.`);
  console.error('  Expected something like 09121112233 or +989121112233.');
  process.exit(1);
}

if (!process.env.DATABASE_URL) {
  console.error('✗ DATABASE_URL is not set. Run: npm run env:setup');
  process.exit(1);
}

const { PrismaClient } = await import('@prisma/client');
const prisma = new PrismaClient();

try {
  const userPhone = await prisma.userPhone.findUnique({
    where: { phone },
    select: { userId: true, verifiedAt: true },
  });

  if (!userPhone) {
    console.error(`✗ No account found for ${phone}.`);
    console.error('');
    console.error('  Log in once first so the account is created by the real');
    console.error('  auth flow, then run this again:');
    console.error('');
    console.error(`    POST /api/v1/auth/otp/request  {"phone":"${phone}","purpose":"LOGIN"}`);
    console.error('    (the code is printed in the API console when SMS_PROVIDER=console)');
    console.error(`    POST /api/v1/auth/otp/verify   {"phone":"${phone}","purpose":"LOGIN","code":"…"}`);
    process.exit(1);
  }

  const role = await prisma.role.findUnique({ where: { slug: roleSlug }, select: { id: true } });
  if (!role) {
    const available = await prisma.role.findMany({ select: { slug: true }, orderBy: { slug: 'asc' } });
    console.error(`✗ Role "${roleSlug}" does not exist.`);
    console.error(`  Available: ${available.map((r) => r.slug).join(', ') || '(none — run npm run seed)'}`);
    process.exit(1);
  }

  const existing = await prisma.userRole.findUnique({
    where: { userId_roleId: { userId: userPhone.userId, roleId: role.id } },
  });

  if (existing) {
    console.log(`==> ${phone} already has ${roleSlug} — nothing to do.`);
  } else {
    await prisma.userRole.create({ data: { userId: userPhone.userId, roleId: role.id } });
    console.log(`✓ Granted ${roleSlug} to ${phone}`);
  }

  const roles = await prisma.userRole.findMany({
    where: { userId: userPhone.userId },
    select: { role: { select: { slug: true } } },
  });
  console.log(`    roles now: ${roles.map((r) => r.role.slug).join(', ')}`);
  console.log('');
  console.log('Log in again — an existing access token still carries the old roles.');
} finally {
  await prisma.$disconnect();
}
