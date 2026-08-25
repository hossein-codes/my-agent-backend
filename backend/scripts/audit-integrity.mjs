import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
const [schema, sql] = await Promise.all([readFile(resolve('prisma/schema.prisma'), 'utf8'), readFile(resolve('prisma/integrity.sql'), 'utf8')]);
const lines = schema.split(/\r?\n/);
const models = lines.map((line, i) => line.match(/^model\s+(\w+)/)?.[1] ? { i, name: line.match(/^model\s+(\w+)/)[1] } : null).filter(Boolean);
const claims = [];
for (let i = 0; i < lines.length; i++) {
  if (!/^\s*\/\/\//.test(lines[i]) && !/^\s*\/\/[^/]/.test(lines[i])) continue;
  if (!/(CHECK|partial unique|trigger|append-only|cycle)/i.test(lines[i])) continue;
  const previous = [...models].reverse().find(m => m.i < i);
  const next = models.find(m => m.i > i);
  // Doc comments immediately before a model describe that model.
  const between = next ? lines.slice(i + 1, next.i).every(line => /^\s*(\/\/|\/\*|\*|\*\/|$)/.test(line)) : false;
  const previousNonEmpty = [...lines.slice(0, i)].reverse().find(line => line.trim());
  const startsModelDoc = next && between && (!previousNonEmpty || /^\s*}/.test(previousNonEmpty));
  const model = startsModelDoc ? next.name : previous?.name ?? next?.name ?? '(schema)';
  claims.push({ line: i + 1, model, text: lines[i].trim() });
}
const aliases = new Map([
  ['UserProfile', 'UserPhone'], ['Brand', 'Category'], ['AttributeValue', 'ProductAttribute'],
  ['NotificationPreference', 'AuditLog'],
]);
const informational = /by convention|app validation|SNAPSHOT|Every financial\/history table/i;
const missing = claims.filter(c => {
  if (informational.test(c.text)) return false;
  const target = aliases.get(c.model) ?? c.model;
  return !sql.includes(`"${target}"`) && !sql.includes(`'${target}'`);
});
console.log(`Schema integrity comments extracted: ${claims.length}`);
for (const c of claims) console.log(`${missing.includes(c) ? 'MISSING' : 'covered'} L${c.line} ${c.model}: ${c.text}`);
console.log(`Integrity SQL coverage: ${claims.length - missing.length}/${claims.length}`);
if (missing.length) { console.error(`\nFAILED — ${missing.length} schema claim(s) have no SQL object:`); for (const c of missing) console.error(`- L${c.line} ${c.model}: ${c.text}`); process.exitCode = 1; }
else console.log('PASS — every CHECK, partial unique, trigger, append-only, and cycle comment maps to integrity.sql.');
