/**
 * In-memory stand-in for Redis, used ONLY when `REDIS_URL=memory`.
 *
 * Purpose: let a developer run the API without installing Redis. It implements
 * the exact subset of commands this codebase uses (`get`, `set` with `EX`/`NX`,
 * `del`, `incr`, `expire`, `ttl`, and the `multi()` pipeline in
 * `tryIncrement`), including TTL expiry semantics.
 *
 * NOT FOR PRODUCTION, by design:
 *   - state lives in one Node process, so it is lost on restart and is wrong
 *     the moment you run a second instance
 *   - `acquireLock` is therefore not a distributed lock
 *
 * `AppConfigService` rejects `memory` when NODE_ENV=production so this can
 * never be switched on by accident.
 */

type Entry = { value: string; expiresAt: number | null };

export class MemoryRedis {
  private readonly store = new Map<string, Entry>();

  // --- expiry ---------------------------------------------------------------

  /** Drops the key if its TTL has passed. Lazy expiry, like Redis itself. */
  private live(key: string): Entry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= Date.now()) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  // --- commands -------------------------------------------------------------

  get(key: string): Promise<string | null> {
    return Promise.resolve(this.live(key)?.value ?? null);
  }

  /**
   * Supports the two call shapes used here:
   *   set(key, value)
   *   set(key, value, 'EX', seconds)          → with optional trailing 'NX'
   */
  set(key: string, value: string, ...args: unknown[]): Promise<'OK' | null> {
    let ttlSeconds: number | null = null;
    let onlyIfAbsent = false;

    for (let i = 0; i < args.length; i += 1) {
      const arg = String(args[i]).toUpperCase();
      if (arg === 'EX') {
        ttlSeconds = Number(args[i + 1]);
        i += 1;
      } else if (arg === 'NX') {
        onlyIfAbsent = true;
      }
    }

    if (onlyIfAbsent && this.live(key)) return Promise.resolve(null);

    this.store.set(key, {
      value,
      expiresAt: ttlSeconds === null ? null : Date.now() + ttlSeconds * 1000,
    });
    return Promise.resolve('OK');
  }

  del(key: string): Promise<number> {
    const existed = this.live(key) !== null;
    this.store.delete(key);
    return Promise.resolve(existed ? 1 : 0);
  }

  incr(key: string): Promise<number> {
    const entry = this.live(key);
    const next = (entry ? Number(entry.value) : 0) + 1;
    this.store.set(key, { value: String(next), expiresAt: entry?.expiresAt ?? null });
    return Promise.resolve(next);
  }

  /** `mode` may be 'NX' — only set a TTL on a key that has none. */
  expire(key: string, seconds: number, mode?: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return Promise.resolve(0);
    if (mode?.toUpperCase() === 'NX' && entry.expiresAt !== null) return Promise.resolve(0);
    entry.expiresAt = Date.now() + seconds * 1000;
    return Promise.resolve(1);
  }

  /** Redis semantics: -2 = no such key, -1 = key exists but has no TTL. */
  ttl(key: string): Promise<number> {
    const entry = this.live(key);
    if (!entry) return Promise.resolve(-2);
    if (entry.expiresAt === null) return Promise.resolve(-1);
    return Promise.resolve(Math.ceil((entry.expiresAt - Date.now()) / 1000));
  }

  /**
   * Minimal pipeline. Commands are queued and run in order on `exec()`,
   * returning ioredis' `[error, result]` tuples.
   */
  multi(): MemoryMulti {
    return new MemoryMulti(this);
  }

  // --- lifecycle (no-ops so it can stand in for an ioredis instance) --------

  connect(): Promise<void> {
    return Promise.resolve();
  }

  quit(): Promise<'OK'> {
    this.store.clear();
    return Promise.resolve('OK');
  }

  disconnect(): void {
    this.store.clear();
  }

  on(): this {
    return this;
  }
}

class MemoryMulti {
  private readonly queue: Array<() => Promise<unknown>> = [];

  constructor(private readonly redis: MemoryRedis) {}

  incr(key: string): this {
    this.queue.push(() => this.redis.incr(key));
    return this;
  }

  expire(key: string, seconds: number, mode?: string): this {
    this.queue.push(() => this.redis.expire(key, seconds, mode));
    return this;
  }

  ttl(key: string): this {
    this.queue.push(() => this.redis.ttl(key));
    return this;
  }

  async exec(): Promise<Array<[Error | null, unknown]>> {
    const results: Array<[Error | null, unknown]> = [];
    for (const run of this.queue) {
      try {
        results.push([null, await run()]);
      } catch (error) {
        results.push([error as Error, null]);
      }
    }
    return results;
  }
}
