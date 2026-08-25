import { PrismaClient } from '@prisma/client';
import { checks, indexes, appendOnlyTables } from './integrity-manifest.mjs';
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(2); }
const db = new PrismaClient();
try {
 const constraints = (await db.$queryRawUnsafe(`SELECT conname AS name FROM pg_constraint WHERE contype='c' AND connamespace='public'::regnamespace`)).map(x=>x.name);
 const dbIndexes = (await db.$queryRawUnsafe(`SELECT indexname AS name FROM pg_indexes WHERE schemaname='public'`)).map(x=>x.name);
 const triggers = await db.$queryRawUnsafe(`SELECT event_object_table AS table FROM information_schema.triggers WHERE trigger_schema='public' AND trigger_name='integrity_append_only' GROUP BY event_object_table`);
 const triggerTables = triggers.map(x=>x.table);
 const missing = [...checks.filter(x=>!constraints.includes(x)).map(x=>`CHECK ${x}`), ...indexes.filter(x=>!dbIndexes.includes(x)).map(x=>`INDEX ${x}`), ...appendOnlyTables.filter(x=>!triggerTables.includes(x)).map(x=>`TRIGGER ${x}`)];
 if (missing.length) { console.error(`Integrity verification FAILED (${missing.length} missing):\n- ${missing.join('\n- ')}`); process.exitCode=1; }
 else console.log(`Integrity verified: ${checks.length} CHECK constraints, ${indexes.length} partial/filtered indexes, ${appendOnlyTables.length} append-only tables.`);
} finally { await db.$disconnect(); }
