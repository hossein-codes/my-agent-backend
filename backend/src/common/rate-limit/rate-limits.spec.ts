import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RATE_LIMIT_BUCKETS } from './rate-limits';

/**
 * Architectural consistency checks.
 *
 * These read the source tree on purpose: a `@RateLimit('typo')` would compile
 * fine and then DENY every request at runtime (the guard fails closed on an
 * unknown bucket). Catching that here is much cheaper than in production.
 */
function walk(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (full.endsWith('.ts') && !full.endsWith('.spec.ts')) out.push(full);
  }
  return out;
}

const sources = walk(join(__dirname, '../..'));

/**
 * Strips block and line comments so documented examples (e.g. a JSDoc snippet
 * showing `@Permissions('a','b')`) are not mistaken for real usages.
 */
function codeOf(file: string): string {
  return readFileSync(file, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:])\/\/.*$/gm, '$1');
}

describe('rate-limit buckets', () => {
  it('defines a bucket for every @RateLimit() used in the codebase', () => {
    const used = new Set<string>();
    for (const file of sources) {
      for (const match of codeOf(file).matchAll(/@RateLimit\(\s*'([^']+)'\s*\)/g)) {
        used.add(match[1]);
      }
    }

    expect(used.size).toBeGreaterThan(0); // the scan actually found decorators
    const missing = [...used].filter((bucket) => !(bucket in RATE_LIMIT_BUCKETS));
    expect(missing).toEqual([]);
  });

  it('gives every bucket a positive limit and window', () => {
    for (const [name, bucket] of Object.entries(RATE_LIMIT_BUCKETS)) {
      expect(bucket.limit).toBeGreaterThan(0);
      expect(bucket.windowSeconds).toBeGreaterThan(0);
      expect(['ip', 'user', 'phone']).toContain(bucket.scope);
      expect(name).toBeTruthy();
    }
  });

  it('scopes OTP buckets per phone so rotating IPs cannot bypass them', () => {
    expect(RATE_LIMIT_BUCKETS['otp.request'].scope).toBe('phone');
    expect(RATE_LIMIT_BUCKETS['otp.verify'].scope).toBe('phone');
  });
});

describe('permission slugs', () => {
  it('are referenced in code only with a stable namespace shape', () => {
    const used = new Set<string>();
    for (const file of sources) {
      for (const match of codeOf(file).matchAll(/@Permissions\(\s*'([^']+)'\s*(?:,\s*'([^']+)'\s*)?\)/g)) {
        if (match[1]) used.add(match[1]);
        if (match[2]) used.add(match[2]);
      }
    }
    expect(used.size).toBeGreaterThan(0);
    for (const slug of used) {
      expect(slug).toMatch(/^[a-z]+\.[a-z]+$/);
    }
  });
});
