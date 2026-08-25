import { spawnSync } from 'node:child_process';
if (!process.env.DATABASE_URL) { console.error('DATABASE_URL is required'); process.exit(2); }
const command = process.platform === 'win32' ? 'npx.cmd' : 'npx';
const result = spawnSync(command, ['--no-install','prisma','db','execute','--file','prisma/integrity.sql'], { stdio:'inherit', env:{...process.env} });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
