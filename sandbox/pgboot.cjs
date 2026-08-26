/**
 * Arena-sandbox helper (NOT needed on your own machine — see README-fa.md).
 *
 * Boots the embedded PostgreSQL shipped in backend optionalDependencies
 * (@embedded-postgres/*) on a fixed port, applies the repo's real migration
 * SQL files, seeds via the real prisma/seed.ts, then stays alive so
 * start_process keeps it running.
 */
const { execFileSync, spawn } = require('node:child_process');
const net = require('node:net');
const fs = require('node:fs');
const path = require('node:path');
const { createRequire } = require('node:module');

const BACKEND = path.resolve(__dirname, '..', 'backend');
const DATA_DIR = '/tmp/fashion-pg/data';
const LOG_FILE = '/tmp/fashion-pg/server.log';
const PORT = 54329;
const URL = `postgresql://postgres@127.0.0.1:${PORT}/postgres?schema=public`;

const req = createRequire(path.join(BACKEND, 'package.json'));

function ensureBackendDeps() {
  if (fs.existsSync(path.join(BACKEND, 'node_modules', '.prisma', 'client', 'index.js'))) {
    console.log('[pgboot] backend deps present');
    return;
  }
  console.log('[pgboot] installing backend deps (node_modules was reset)…');
  execFileSync('npm', ['install', '--no-audit', '--no-fund'], { cwd: BACKEND, stdio: 'inherit' });
  execFileSync('npm', ['install', '--no-save', '@prisma/adapter-pg'], { cwd: BACKEND, stdio: 'inherit' });
  execFileSync('npx', ['prisma', 'generate'], {
    cwd: BACKEND,
    stdio: 'inherit',
    env: {
      ...process.env,
      PRISMA_SCHEMA_ENGINE_BINARY: '/bin/true',
      PRISMA_QUERY_ENGINE_LIBRARY: '/bin/true',
      PRISMA_CLIENT_ENGINE_TYPE: 'client',
    },
  });
}

function resolveBinaries() {
  const entry = req.resolve('@embedded-postgres/linux-x64');
  const packageRoot = path.resolve(path.dirname(entry), '..');
  const nativeDir = path.join(packageRoot, 'native');
  return {
    binDir: path.join(nativeDir, 'bin'),
    libDir: path.join(nativeDir, 'lib'),
    env: {
      ...process.env,
      PATH: `${path.join(nativeDir, 'bin')}:${process.env.PATH ?? ''}`,
      LD_LIBRARY_PATH: [path.join(nativeDir, 'lib'), process.env.LD_LIBRARY_PATH].filter(Boolean).join(':'),
    },
  };
}

function run(file, args, env) {
  execFileSync(file, args, { env, stdio: ['ignore', 'inherit', 'inherit'] });
}

function portOpen() {
  return new Promise((resolve) => {
    const sock = net.connect(PORT, '127.0.0.1');
    sock.once('connect', () => { sock.destroy(); resolve(true); });
    sock.once('error', () => resolve(false));
  });
}

async function main() {
  ensureBackendDeps();
  const { binDir, env } = resolveBinaries();

  if (await portOpen()) {
    console.log('[pgboot] PostgreSQL already running, reusing cluster');
  } else {
    if (!fs.existsSync(path.join(DATA_DIR, 'PG_VERSION'))) {
      console.log('[pgboot] running initdb…');
      run(path.join(binDir, 'initdb'), [
        '--pgdata', DATA_DIR, '--username', 'postgres', '--auth', 'trust',
        '--encoding', 'UTF8', '--no-locale',
      ], env);
    } else {
      console.log('[pgboot] data dir exists, starting cluster…');
      const pidFile = path.join(DATA_DIR, 'postmaster.pid');
      if (fs.existsSync(pidFile)) fs.rmSync(pidFile);
    }
    run(path.join(binDir, 'pg_ctl'), [
      '--pgdata', DATA_DIR, '--log', LOG_FILE, '--wait', '--timeout', '60', 'start',
      '--options', `-h 0.0.0.0 -p ${PORT} -F -c synchronous_commit=off -c full_page_writes=off -c fsync=off`,
    ], env);
  }
  console.log(`[pgboot] PostgreSQL up on ${URL}`);

  // Apply the repo's real migrations with the pg driver (the prisma
  // schema-engine binary cannot be downloaded from this sandbox's network).
  const { Client } = req('pg');
  const client = new Client({ connectionString: URL });
  await client.connect();

  const migrationsRoot = path.join(BACKEND, 'prisma', 'migrations');
  const dirs = fs.readdirSync(migrationsRoot, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name)
    .sort();
  await client.query(`CREATE TABLE IF NOT EXISTS _prisma_migrations (
    id VARCHAR(36) PRIMARY KEY,
    checksum VARCHAR(64) NOT NULL,
    finished_at TIMESTAMPTZ,
    migration_name VARCHAR(255) NOT NULL,
    logs TEXT,
    applied_steps_count INT NOT NULL DEFAULT 0,
    rolled_back_at TIMESTAMPTZ,
    started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    rolled_back_reason TEXT
  )`);
  for (const dir of dirs) {
    const name = path.basename(dir);
    const already = await client.query(
      `SELECT id FROM _prisma_migrations WHERE migration_name = $1 AND rolled_back_at IS NULL`, [name]);
    if (already.rowCount > 0) {
      console.log(`[pgboot] migration ${name}: already applied, skipping`);
      continue;
    }
    const sql = fs.readFileSync(path.join(migrationsRoot, dir, 'migration.sql'), 'utf8');
    await client.query(sql);
    await client.query(
      `INSERT INTO _prisma_migrations (id, checksum, finished_at, migration_name, applied_steps_count)
       VALUES (md5(random()::text), md5($1), now(), $2, 1)`, [sql, name]);
    console.log(`[pgboot] applied migration ${name}`);
  }

  const roles = await client.query('SELECT COUNT(*)::int AS n FROM "Role"');
  await client.end();
  if (roles.rows[0].n === 0) {
    console.log('[pgboot] seeding via prisma/seed.ts…');
    execFileSync('npx', ['ts-node', '--transpile-only', 'prisma/seed.ts'], {
      cwd: BACKEND,
      stdio: 'inherit',
      env: {
        ...process.env,
        NODE_OPTIONS: `--require ${path.join(__dirname, 'prisma-wasm-patch.cjs')}`,
      },
    });
  } else {
    console.log(`[pgboot] already seeded (${roles.rows[0].n} roles)`);
  }

  console.log('[pgboot] DATABASE_URL=' + URL);
  console.log('[pgboot] ready — keeping process alive');
  process.on('SIGTERM', () => {
    try { execFileSync(path.join(binDir, 'pg_ctl'), ['--pgdata', DATA_DIR, '--mode', 'fast', 'stop'], { env }); } catch {}
    process.exit(0);
  });
  setInterval(() => {}, 1 << 30);
}

main().catch((err) => { console.error('[pgboot] FAILED:', err); process.exit(1); });
