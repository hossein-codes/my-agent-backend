/**
 * Arena-sandbox preload (NODE_OPTIONS=--require). Injects the pg driver
 * adapter into PrismaClient so the WASM (query-compiler) client generated
 * offline can talk to PostgreSQL. The project's own code is untouched — on a
 * normal machine with internet access the native engine works without this.
 */
const path = require('node:path');
const { createRequire } = require('node:module');
const req = createRequire(path.join(__dirname, '..', 'backend', 'package.json'));

const mod = req('@prisma/client');
const { PrismaPg } = req('@prisma/adapter-pg');
const { Pool } = req('pg');

const OriginalPrismaClient = mod.PrismaClient;

class PrismaClientWithAdapter extends OriginalPrismaClient {
  constructor(args = {}) {
    const url = args?.datasources?.db?.url || process.env.DATABASE_URL;
    const { datasources, ...rest } = args ?? {};
    const pool = new Pool({ connectionString: url, max: 15 });
    super({ ...rest, adapter: new PrismaPg(pool) });
  }
}

Object.defineProperty(mod, 'PrismaClient', {
  enumerable: true,
  configurable: true,
  get: () => PrismaClientWithAdapter,
});

console.log('[prisma-wasm-patch] PrismaClient → pg driver adapter (WASM engine)');
