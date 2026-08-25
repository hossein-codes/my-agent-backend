/**
 * In-memory stand-in for Redis — DEVELOPMENT ONLY.
 *
 * Selected by setting `REDIS_URL=memory`. It exists for one reason: Redis has
 * no official Windows build, and without something answering the Redis calls
 * the OTP flow fails closed with HTTP 503 (see `OtpService`), which makes the
 * login path impossible to exercise on a plain Windows dev box.
 *
 * THIS IS NOT A REDIS REPLACEMENT AND MUST NEVER RUN IN PRODUCTION:
 *
 *   1. Single process. The state lives in this process's heap. Two API
 *      instances (or a restart behind `nodemon`/`nest start --watch`) see two
 *      unrelated stores, so OTPs, rate-limit counters and locks are NOT shared
 *      across workers. Real Redis is shared by every instance.
 *   2. Non-persistent. Restarting the process drops every OTP, every rate-limit
 *      window and every lock. Nothing survives, and there is no RDB/AOF to
 *      recover from.
 *   3. Not atomic across processes, not clusterable, no pub/sub, no Lua, no
 *      eviction policy, no persistence, no TLS, no ACLs.
 *
 * `AppConfigService.redisUrl` refuses to hand this out when
 * `NODE_ENV=production` so it cannot reach a real deployment by accident.
 *
 * Scope: only the subset of commands this codebase actually issues is
 * implemented (see `RedisCommandSurface`). Anything else is deliberately
 * absent rather than silently faked — calling it is a TypeScript error, and at
 * runtime it throws, so a new call site cannot quietly "work" here and then
 * break in production.
 */

/** The sentinel value of `REDIS_URL` that selects this implementation. */
export const MEMORY_REDIS_URL = 'memory';

interface Entry {
  value: string;
  /**
   * Absolute epoch (ms) at which the key dies, or `null` when it never expires.
   * Storing an absolute deadline (rather than a countdown) is what makes TTL
   * survive `INCR`: incrementing a value never touches `expiresAt`, so a
   * rate-limit window cannot be extended by the traffic it is counting.
   */
  expiresAt: number | null;
}

/** The command surface this app actually uses. Implemented by both clients. */
export interface RedisCommandSurface {
  readonly status: string;
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ...args: Array<string | number>): Promise<'OK' | null>;
  del(...keys: string[]): Promise<number>;
  incr(key: string): Promise<number>;
  expire(key: string, seconds: number, mode?: ExpireMode): Promise<number>;
  ttl(key: string): Promise<number>;
  multi(): MemoryRedisMulti;
  connect(): Promise<void>;
  quit(): Promise<'OK'>;
  disconnect(): void;
  on(event: string, listener: (...args: unknown[]) => void): unknown;
}

/** `EXPIRE` options Redis 7 accepts; `NX` is what keeps windows from sliding. */
export type ExpireMode = 'NX' | 'XX' | 'GT' | 'LT';

type QueuedCommand = { name: string; args: unknown[] };

/**
 * `MULTI` stand-in. Commands are queued and only run inside `exec()`, and each
 * result comes back as the same `[error, result]` tuple ioredis returns, so
 * callers can destructure both shapes identically.
 */
export class MemoryRedisMulti {
  private readonly queue: QueuedCommand[] = [];

  constructor(private readonly run: (name: string, args: unknown[]) => unknown) {}

  private push(name: string, args: unknown[]): this {
    this.queue.push({ name, args });
    return this;
  }

  get(key: string): this {
    return this.push('get', [key]);
  }
  set(key: string, value: string, ...args: Array<string | number>): this {
    return this.push('set', [key, value, ...args]);
  }
  del(...keys: string[]): this {
    return this.push('del', keys);
  }
  incr(key: string): this {
    return this.push('incr', [key]);
  }
  expire(key: string, seconds: number, mode?: ExpireMode): this {
    return this.push('expire', mode === undefined ? [key, seconds] : [key, seconds, mode]);
  }
  ttl(key: string): this {
    return this.push('ttl', [key]);
  }

  /**
   * Runs the queued commands in order.
   *
   * @returns one `[error, result]` tuple per queued command. A command that
   * throws yields `[Error, null]` and does not abort its siblings — that is
   * MULTI's contract, and `RedisService.tryIncrement()` reads `tuple[0]` to
   * decide whether the whole check failed.
   *
   * The `| null` mirrors ioredis' signature (it resolves `null` when a
   * transaction is discarded). Nothing here can discard one, because only the
   * typed methods above can queue a command — but keeping the union means call
   * sites compile unchanged against either client.
   */
  async exec(): Promise<Array<[Error | null, unknown]> | null> {
    return this.queue.map(({ name, args }) => {
      try {
        return [null, this.run(name, args)] as [Error | null, unknown];
      } catch (err) {
        return [err as Error, null] as [Error | null, unknown];
      }
    });
  }
}

export class MemoryRedis implements RedisCommandSurface {
  private readonly store = new Map<string, Entry>();

  /** ioredis exposes `.status`; kept so health/logging code can read it. */
  readonly status = 'ready';

  // --- key access (expiry is applied lazily, on read) -------------------------

  /** Wall clock as ms. `Date.now()` so Jest fake timers control expiry. */
  private now(): number {
    return Date.now();
  }

  /**
   * Returns the live entry for `key`, evicting it first if its deadline has
   * passed. Expiry is lazy (checked on access) rather than timer-driven: same
   * observable semantics, no background timer, no drift, nothing to unref.
   */
  private live(key: string): Entry | null {
    const entry = this.store.get(key);
    if (!entry) return null;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now()) {
      this.store.delete(key);
      return null;
    }
    return entry;
  }

  // --- commands --------------------------------------------------------------

  // Every public command is a thin async wrapper over a synchronous core. That
  // keeps one implementation per command, so a command queued inside `multi()`
  // behaves identically to the same command awaited directly.

  async get(key: string): Promise<string | null> {
    return this.getSync(key);
  }

  /**
   * `SET key value [EX s | PX ms] [KEEPTTL] [NX | XX]`.
   * Resolves `'OK'` on success and `null` when NX/XX rejected the write —
   * exactly ioredis' shape, which `acquireLock()` depends on.
   */
  async set(key: string, value: string, ...args: Array<string | number>): Promise<'OK' | null> {
    return this.setSync(key, value, args);
  }

  /** @returns how many of the given keys actually existed. */
  async del(...keys: string[]): Promise<number> {
    return this.delSync(keys);
  }

  /**
   * `INCR key` — creates the key at 1 when missing, and **preserves an
   * existing TTL**. Preserving the deadline is the whole point: the rate-limit
   * counter is bumped on every request, and if that also reset the expiry the
   * window would slide forever and a busy client would never get a fresh one.
   */
  async incr(key: string): Promise<number> {
    return this.incrSync(key);
  }

  /**
   * `EXPIRE key seconds [NX|XX|GT|LT]`. Resolves 1 when the deadline was set,
   * 0 when it was not (key missing, or the mode vetoed it). A non-positive
   * TTL deletes the key, as Redis does.
   */
  async expire(key: string, seconds: number, mode?: ExpireMode): Promise<number> {
    return this.expireSync(key, seconds, mode);
  }

  /** `-2` = key does not exist, `-1` = exists without TTL, else seconds left. */
  async ttl(key: string): Promise<number> {
    return this.ttlSync(key);
  }

  multi(): MemoryRedisMulti {
    return new MemoryRedisMulti((name, args) => this.dispatch(name, args));
  }

  // --- connection lifecycle (no-ops: there is nothing to connect to) ----------

  /** No-op — resolves like ioredis' `connect()` on a healthy client. */
  async connect(): Promise<void> {
    return undefined;
  }
  /** No-op — resolves `'OK'` so `onModuleDestroy()` can await it. */
  async quit(): Promise<'OK'> {
    this.store.clear();
    return 'OK';
  }
  /** No-op — nothing to tear down. */
  disconnect(): void {
    return undefined;
  }
  /** No-op — this client never emits; listeners are accepted and ignored. */
  on(_event: string, _listener: (...args: unknown[]) => void): this {
    return this;
  }

  // --- internals --------------------------------------------------------------

  /** Executes a queued MULTI command by name. */
  private dispatch(name: string, args: unknown[]): unknown {
    switch (name) {
      case 'get':
        return this.getSync(String(args[0]));
      case 'set':
        return this.setSync(args[0] as string, args[1] as string, args.slice(2));
      case 'del':
        return this.delSync(args as string[]);
      case 'incr':
        return this.incrSync(String(args[0]));
      case 'expire':
        return this.expireSync(String(args[0]), Number(args[1]), args[2] as ExpireMode | undefined);
      case 'ttl':
        return this.ttlSync(String(args[0]));
      default:
        throw new Error(
          `MemoryRedis does not implement "${name}". It covers only the commands this ` +
            'codebase uses; add the method (and a spec) rather than widening this shim.',
        );
    }
  }

  private getSync(key: string): string | null {
    return this.live(key)?.value ?? null;
  }

  private setSync(key: string, value: string, args: unknown[]): 'OK' | null {
    const existing = this.live(key);
    let ttlMillis: number | null = null;
    let keepTtl = false;
    let onlyIfAbsent = false;
    let onlyIfPresent = false;

    for (let i = 0; i < args.length; i += 1) {
      const flag = String(args[i]).toUpperCase();
      const next = args[i + 1];
      switch (flag) {
        case 'EX':
        case 'PX': {
          const raw = Number(next);
          if (!Number.isFinite(raw)) throw new Error(`ERR syntax error: ${flag} needs a number`);
          ttlMillis = flag === 'EX' ? raw * 1000 : raw;
          i += 1; // the duration belongs to this flag
          break;
        }
        case 'KEEPTTL':
          keepTtl = true;
          break;
        case 'NX':
          onlyIfAbsent = true;
          break;
        case 'XX':
          onlyIfPresent = true;
          break;
        default:
          throw new Error(`ERR syntax error: unsupported SET option "${flag}"`);
      }
    }

    if (onlyIfAbsent && existing) return null;
    if (onlyIfPresent && !existing) return null;

    // A plain SET drops any previous TTL unless KEEPTTL was given.
    const expiresAt = keepTtl
      ? (existing?.expiresAt ?? null)
      : ttlMillis === null
        ? null
        : this.now() + ttlMillis;

    this.store.set(key, { value, expiresAt });
    return 'OK';
  }

  private delSync(keys: string[]): number {
    let removed = 0;
    for (const key of keys) {
      if (this.live(key)) {
        this.store.delete(key);
        removed += 1;
      }
    }
    return removed;
  }

  private incrSync(key: string): number {
    const existing = this.live(key);
    if (existing && !/^-?\d+$/.test(existing.value)) {
      throw new Error('ERR value is not an integer or out of range');
    }
    const next = existing ? Number.parseInt(existing.value, 10) + 1 : 1;
    // expiresAt is carried over untouched — the window is never re-armed here.
    this.store.set(key, { value: String(next), expiresAt: existing?.expiresAt ?? null });
    return next;
  }

  private expireSync(key: string, seconds: number, mode?: ExpireMode): number {
    const entry = this.live(key);
    if (!entry) return 0;

    const current = entry.expiresAt;
    const proposed = this.now() + seconds * 1000;

    if (mode) {
      const allowed =
        mode === 'NX'
          ? current === null // only when the key has no TTL yet
          : mode === 'XX'
            ? current !== null // only when it already has one
            : mode === 'GT'
              ? current === null || proposed > current
              : current === null || proposed < current;
      if (!allowed) return 0;
    }

    if (seconds <= 0) {
      this.store.delete(key);
      return 1;
    }

    entry.expiresAt = proposed;
    return 1;
  }

  private ttlSync(key: string): number {
    const entry = this.live(key);
    if (!entry) return -2;
    if (entry.expiresAt === null) return -1;
    // Redis reports the remaining TTL rounded up to the next whole second.
    return Math.ceil((entry.expiresAt - this.now()) / 1000);
  }
}
