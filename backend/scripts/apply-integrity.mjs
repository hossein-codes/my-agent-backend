import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import pg from 'pg';

const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is required (Neon URLs should include sslmode=require)'); process.exit(2); }
const pool = new Pool({ connectionString: url, ssl: /neon\.tech|sslmode=require/i.test(url) ? { rejectUnauthorized: false } : undefined });
try {
  await pool.query(await readFile(resolve('prisma/integrity.sql'), 'utf8'));
  console.log('Database integrity SQL applied successfully (safe to repeat).');
} catch (error) {
  console.error(`Database integrity apply failed: ${error.message}`);
  console.error('If existing data violates a new constraint, clean that data first; failing is intentional.');
  process.exitCode = 1;
} finally { await pool.end(); }
