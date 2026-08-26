import { parseEnvLine } from '../../prisma/env-loader';

/**
 * The seed script parses .env by hand because `prisma db seed` runs outside
 * Nest's DI container. A value that swallows its trailing comment becomes a
 * wrong DATABASE_URL, and the failure surfaces far away from the cause.
 */
describe('parseEnvLine', () => {
  it('reads a plain key/value', () => {
    expect(parseEnvLine('PORT=3000')).toEqual(['PORT', '3000']);
  });

  it('drops a trailing comment separated by whitespace', () => {
    expect(parseEnvLine('API_PREFIX=api/v1   # the API prefix')).toEqual(['API_PREFIX', 'api/v1']);
    expect(parseEnvLine('NODE_ENV=development  # development | test')).toEqual(['NODE_ENV', 'development']);
  });

  it('keeps a # that is not preceded by whitespace', () => {
    // A password or URL fragment must survive.
    expect(parseEnvLine('SECRET=abc#123')).toEqual(['SECRET', 'abc#123']);
    expect(parseEnvLine('URL=http://x/y#frag')).toEqual(['URL', 'http://x/y#frag']);
  });

  it('strips surrounding quotes and keeps inner spaces', () => {
    expect(parseEnvLine('NAME="Fashion Store"')).toEqual(['NAME', 'Fashion Store']);
    expect(parseEnvLine("NAME='Fashion Store'")).toEqual(['NAME', 'Fashion Store']);
    expect(parseEnvLine('NAME="quoted # not a comment"')).toEqual(['NAME', 'quoted # not a comment']);
  });

  it('accepts an empty value', () => {
    expect(parseEnvLine('KAVENEGAR_API_KEY=')).toEqual(['KAVENEGAR_API_KEY', '']);
  });

  it('ignores blank lines and whole-line comments', () => {
    expect(parseEnvLine('')).toBeNull();
    expect(parseEnvLine('   ')).toBeNull();
    expect(parseEnvLine('# a comment')).toBeNull();
    expect(parseEnvLine('   # indented comment')).toBeNull();
  });

  it('ignores malformed lines', () => {
    expect(parseEnvLine('NOT_A_PAIR')).toBeNull();
    expect(parseEnvLine('=novalue')).toBeNull();
    expect(parseEnvLine('9STARTS_WITH_DIGIT=1')).toBeNull();
  });

  it('tolerates leading whitespace', () => {
    expect(parseEnvLine('  PORT=3000')).toEqual(['PORT', '3000']);
  });

  it('parses the real .env.example without leaking comments into values', () => {
    // Guards the actual shipped template, not a synthetic sample.
    const fs = require('node:fs') as typeof import('node:fs');
    const path = require('node:path') as typeof import('node:path');
    const content = fs.readFileSync(path.resolve(__dirname, '../../.env.example'), 'utf8');

    const parsed = Object.fromEntries(
      content
        .split('\n')
        .map(parseEnvLine)
        .filter((x): x is [string, string] => x !== null),
    );

    expect(parsed.API_PREFIX).toBe('api/v1');
    expect(parsed.NODE_ENV).toBe('development');
    expect(parsed.PAYMENT_PROVIDER).toBe('mock');
    expect(parsed.MAX_CART_ITEMS).toBe('50');
    // The frontend runs on 3001 locally (the API owns 3000) — see RUN-LOCAL-fa.md.
    expect(parsed.FRONTEND_BASE_URL).toBe('http://localhost:3001');
    // No value may carry a comment fragment.
    for (const [key, value] of Object.entries(parsed)) {
      expect(value).not.toMatch(/\s#\s/);
      expect(`${key}=${value}`).toBeTruthy();
    }
  });
});
