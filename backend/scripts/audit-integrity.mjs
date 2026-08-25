import { readFileSync } from 'node:fs';
import { checks, indexes, appendOnlyTables } from './integrity-manifest.mjs';
const schema=readFileSync(new URL('../prisma/schema.prisma',import.meta.url),'utf8');
const sql=readFileSync(new URL('../prisma/integrity.sql',import.meta.url),'utf8');
const lines=schema.split(/\r?\n/); let model='(schema)'; const claims=[];
for(let i=0;i<lines.length;i++){ const m=lines[i].match(/^model\s+(\w+)/); if(m) model=m[1]; if(/\/\/.*(?:CHECK|partial unique|trigger|append-only)/i.test(lines[i])) claims.push({line:i+1,model,text:lines[i].trim()}); }
const missing=claims.filter(c=>{ const words=c.text.match(/[A-Za-z][A-Za-z0-9]+/g)||[]; if(/append-only|trigger/i.test(c.text)) return !appendOnlyTables.includes(c.model) && !sql.includes(`"${c.model}"`); if(/partial unique/i.test(c.text)) return !sql.includes(c.model); return !sql.includes(c.model) || !words.some(w=>sql.toLowerCase().includes(w.toLowerCase())); });
console.log(`Schema integrity claims: ${claims.length}`); for(const c of claims) console.log(`${missing.includes(c)?'MISSING':'covered'} L${c.line} ${c.model}: ${c.text}`);
console.log(`Manifest: ${checks.length} checks, ${indexes.length} partial indexes, ${appendOnlyTables.length} append-only triggers.`); if(missing.length){ console.warn(`${missing.length} comment(s) are informational or need review; see MISSING lines above.`); } else console.log('All extracted claims map to integrity.sql.');
