import { existsSync, readFileSync } from 'node:fs';

/**
 * Minimal .env loader for scripts that run outside the Nest DI container
 * (chiefly `prisma/seed.ts`, which `prisma db seed` invokes directly).
 *
 * Parsing matches dotenv closely enough for this repo's files:
 *   - `#` comments are dropped, whether they own the line or trail a value
 *   - surrounding single/double quotes are removed
 *   - a `#` that is NOT preceded by whitespace is kept, so it survives inside
 *     passwords and URL fragments
 */
export function parseEnvLine(line: string): [string, string] | null {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) return null;

  const match = /^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/.exec(trimmed);
  if (!match) return null;

  const raw = match[2];
  const quoted = /^(['"])([\s\S]*)\1$/.exec(raw.trim());
  const value = quoted ? quoted[2] : raw.replace(/\s+#.*$/, '').trim();

  return [match[1], value];
}

/**
 * Loads the given files in order. Values already present in `process.env` win,
 * and earlier files win over later ones.
 *
 * @returns the keys that were newly set, so callers can log what changed.
 */
export function loadEnvFiles(files: string[], stopWhenSet?: string): string[] {
  const applied: string[] = [];

  for (const file of files) {
    if (stopWhenSet && process.env[stopWhenSet]) break;
    if (!existsSync(file)) continue;

    for (const line of readFileSync(file, 'utf8').split('\n')) {
      const parsed = parseEnvLine(line);
      if (!parsed) continue;
      const [key, value] = parsed;
      if (process.env[key] !== undefined && process.env[key] !== '') continue;
      process.env[key] = value;
      applied.push(key);
    }
  }

  return applied;
}
