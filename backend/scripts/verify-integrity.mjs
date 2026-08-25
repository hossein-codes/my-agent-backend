import pg from 'pg';
import { checks, indexes, appendOnlyTables, triggerNames } from './integrity-manifest.mjs';
const { Pool } = pg;
const url = process.env.DATABASE_URL;
if (!url) { console.error('DATABASE_URL is required (Neon URLs should include sslmode=require)'); process.exit(2); }
const db = new Pool({ connectionString: url, ssl: /neon\.tech|sslmode=require/i.test(url) ? { rejectUnauthorized: false } : undefined });
try {
  const [c, i, t] = await Promise.all([
    db.query(`SELECT conname AS name FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace`),
    db.query(`SELECT indexname AS name FROM pg_indexes WHERE schemaname='public'`),
    db.query(`SELECT DISTINCT trigger_name AS name, event_object_table AS table_name FROM information_schema.triggers WHERE trigger_schema='public'`),
  ]);
  const constraints = c.rows.map(x => x.name), indexesInDb = i.rows.map(x => x.name);
  const triggers = t.rows.map(x => `${x.name}:${x.table_name}`);
  const missing = [
    ...checks.filter(x => !constraints.includes(x)).map(x => `CHECK ${x}`),
    ...indexes.filter(x => !indexesInDb.includes(x)).map(x => `INDEX ${x}`),
    ...appendOnlyTables.filter(x => !triggers.includes(`integrity_append_only:${x}`)).map(x => `TRIGGER integrity_append_only ON ${x}`),
    ...triggerNames.filter(x => x !== 'integrity_append_only' && !triggers.some(tn => tn.startsWith(`${x}:`))).map(x => `TRIGGER ${x}`),
  ];
  console.log(`PostgreSQL catalog: ${constraints.length} CHECK constraints, ${indexesInDb.length} indexes, ${new Set(t.rows.map(x => x.name)).size} trigger names (${t.rows.length} table/event rows)`);
  console.log(`Required integrity objects: ${checks.length} CHECK, ${indexes.length} unique/partial index, ${appendOnlyTables.length + triggerNames.length - 1} trigger bindings`);
  if (missing.length) { console.error(`\nFAILED — ${missing.length} required object(s) missing:\n- ${missing.join('\n- ')}`); process.exitCode = 1; }
  else console.log('\nPASS — every required integrity object is present in pg_constraint, pg_indexes, and information_schema.triggers.');
} catch (error) { console.error(`Catalog verification failed: ${error.message}`); process.exitCode = 1; }
finally { await db.end(); }
