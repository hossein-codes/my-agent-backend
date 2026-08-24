/**
 * Jest global setup (referenced by `package.json` → `jest.setupFiles`).
 *
 * Jest runs with `rootDir: src`, so this file lives at `src/test-setup.ts`.
 * It must NOT import application code — only establish the environment.
 */

// Deterministic time-dependent tests can override per-suite with jest.useFakeTimers().
process.env.NODE_ENV = 'test';

// Tests must never reach real infrastructure. These values are intentionally
// invalid so a mis-targeted test fails loudly instead of hitting a real DB.
process.env.DATABASE_URL ??= 'postgresql://test:test@127.0.0.1:5432/fashion_test';
process.env.REDIS_URL ??= 'redis://127.0.0.1:6399/0';

// Keep the console readable: Nest logs at warn+ only during tests.
process.env.LOG_LEVEL ??= 'warn';
process.env.SWAGGER_ENABLED ??= 'false';
