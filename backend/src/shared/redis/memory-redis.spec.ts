import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import { AppConfigService } from '../../config/app-config.service';
import { MEMORY_REDIS_URL, MemoryRedis } from './memory-redis';
import { RedisService } from './redis.service';

/**
 * `MemoryRedis` is a development stand-in, so its contract is "behave like
 * Redis for the commands this app issues". These tests pin the parts where a
 * wrong answer would be silent and expensive:
 *
 *   - TTL must actually expire (otherwise OTPs live forever)
 *   - `ttl` must use Redis' -2 / -1 sentinels (OtpService puts them in a
 *     user-facing "wait N seconds" message)
 *   - `INCR` and `EXPIRE ... NX` must NOT re-arm an existing deadline, or a
 *     busy client could keep a rate-limit window open indefinitely
 *   - `multi().exec()` must return `[error, result]` tuples, because
 *     `RedisService.tryIncrement()` destructures exactly that shape
 *
 * Expiry is driven by `Date.now()`, so Jest's fake timers control the clock.
 */
describe('MemoryRedis', () => {
  let redis: MemoryRedis;

  beforeEach(() => {
    jest.useFakeTimers();
    redis = new MemoryRedis();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  // --- get / set / del -------------------------------------------------------

  it('returns null for a key that was never written', async () => {
    expect(await redis.get('missing')).toBeNull();
  });

  it('round-trips a value and overwrites it on a second SET', async () => {
    expect(await redis.set('k', 'first')).toBe('OK');
    expect(await redis.get('k')).toBe('first');

    await redis.set('k', 'second');
    expect(await redis.get('k')).toBe('second');
  });

  it('drops the previous TTL on a plain SET, but keeps it with KEEPTTL', async () => {
    await redis.set('k', 'v', 'EX', 100);
    expect(await redis.ttl('k')).toBe(100);

    // Real Redis clears the TTL when SET is used without an expiry argument.
    await redis.set('k', 'v2');
    expect(await redis.ttl('k')).toBe(-1);

    await redis.set('k', 'v3', 'EX', 100);
    await redis.set('k', 'v4', 'KEEPTTL');
    expect(await redis.ttl('k')).toBe(100);
  });

  it('del removes existing keys only and reports how many it removed', async () => {
    await redis.set('a', '1');
    await redis.set('b', '2');

    expect(await redis.del('a', 'nope', 'b')).toBe(2);
    expect(await redis.get('a')).toBeNull();
    expect(await redis.get('b')).toBeNull();
    expect(await redis.del('a')).toBe(0);
  });

  // --- TTL -------------------------------------------------------------------

  it('expires a key exactly when its deadline passes', async () => {
    await redis.set('otp', 'hash', 'EX', 100);

    jest.advanceTimersByTime(99_999);
    expect(await redis.get('otp')).toBe('hash');

    jest.advanceTimersByTime(1); // 100s elapsed → deadline reached
    expect(await redis.get('otp')).toBeNull();
  });

  it('reports ttl as -2 for a missing key and -1 for a key without a TTL', async () => {
    expect(await redis.ttl('never-set')).toBe(-2);

    await redis.set('forever', 'v'); // no EX → persistent
    expect(await redis.ttl('forever')).toBe(-1);
  });

  it('counts the ttl down and returns -2 once the key is gone', async () => {
    await redis.set('k', 'v', 'EX', 100);
    expect(await redis.ttl('k')).toBe(100);

    jest.advanceTimersByTime(30_000);
    expect(await redis.ttl('k')).toBe(70);

    jest.advanceTimersByTime(70_000);
    expect(await redis.ttl('k')).toBe(-2);
  });

  // --- NX / XX ---------------------------------------------------------------

  it('SET NX writes only when the key is absent and never overwrites', async () => {
    expect(await redis.set('lock', '1', 'EX', 60, 'NX')).toBe('OK');

    // A second acquirer must be refused and must not touch the stored value.
    expect(await redis.set('lock', '2', 'EX', 60, 'NX')).toBeNull();
    expect(await redis.get('lock')).toBe('1');
  });

  it('SET XX writes only when the key already exists', async () => {
    expect(await redis.set('k', 'v', 'XX')).toBeNull();

    await redis.set('k', 'v');
    expect(await redis.set('k', 'v2', 'XX')).toBe('OK');
    expect(await redis.get('k')).toBe('v2');
  });

  // --- INCR ------------------------------------------------------------------

  it('creates a counter at 1 with no TTL when the key does not exist', async () => {
    expect(await redis.incr('hits')).toBe(1);
    expect(await redis.incr('hits')).toBe(2);
    expect(await redis.ttl('hits')).toBe(-1); // INCR alone sets no expiry
  });

  it('preserves an existing TTL so the rate-limit window cannot slide', async () => {
    await redis.set('hits', '0', 'EX', 60);

    expect(await redis.incr('hits')).toBe(1);
    expect(await redis.ttl('hits')).toBe(60); // NOT re-armed to a fresh 60

    jest.advanceTimersByTime(30_000);
    expect(await redis.incr('hits')).toBe(2);
    expect(await redis.ttl('hits')).toBe(30); // window keeps draining

    jest.advanceTimersByTime(30_000);
    expect(await redis.get('hits')).toBeNull();
  });

  it('rejects a non-integer value the way Redis does', async () => {
    await redis.set('k', 'not-a-number');
    await expect(redis.incr('k')).rejects.toThrow(/not an integer/);
  });

  // --- EXPIRE ----------------------------------------------------------------

  it('EXPIRE NX sets the deadline only once and returns 0 for a missing key', async () => {
    await redis.incr('hits'); // counter with no TTL

    expect(await redis.expire('hits', 60, 'NX')).toBe(1);
    jest.advanceTimersByTime(45_000);

    // The second call must be refused — this is what stops the window sliding.
    expect(await redis.expire('hits', 60, 'NX')).toBe(0);
    expect(await redis.ttl('hits')).toBe(15);

    expect(await redis.expire('missing', 60, 'NX')).toBe(0);
  });

  // --- MULTI -----------------------------------------------------------------

  it('multi().exec() runs commands in order and returns [error, result] tuples', async () => {
    await redis.set('k', 'v');

    const results = await redis.multi().get('k').incr('hits').ttl('k').exec();

    expect(results).toEqual([
      [null, 'v'],
      [null, 1],
      [null, -1],
    ]);
  });

  it('reports a failing command as [Error, null] without aborting its siblings', async () => {
    await redis.set('k', 'not-a-number');

    const results = await redis.multi().incr('k').get('k').exec();

    expect(results).toHaveLength(2);
    expect(results?.[0]?.[0]).toBeInstanceOf(Error);
    expect(results?.[0]?.[1]).toBeNull();
    // The next command still ran.
    expect(results?.[1]).toEqual([null, 'not-a-number']);
  });

  it('keeps one fixed window across repeated hits (the tryIncrement pattern)', async () => {
    // Exactly what RedisService.tryIncrement() queues.
    const hit = async () => {
      const [count, , ttl] = (await redis
        .multi()
        .incr('rl:otp.request:ip')
        .expire('rl:otp.request:ip', 60, 'NX')
        .ttl('rl:otp.request:ip')
        .exec()) as [[Error | null, number], [Error | null, number], [Error | null, number]];
      return { count: count[1], ttl: ttl[1] };
    };

    expect(await hit()).toEqual({ count: 1, ttl: 60 });

    jest.advanceTimersByTime(20_000);
    expect(await hit()).toEqual({ count: 2, ttl: 40 }); // window drains, not resets

    jest.advanceTimersByTime(40_000); // window elapsed → counter gone
    expect(await hit()).toEqual({ count: 1, ttl: 60 });
  });

  // --- lifecycle -------------------------------------------------------------

  it('treats connect/quit/disconnect/on as no-ops so it can stand in for ioredis', async () => {
    const listener = jest.fn();
    expect(redis.on('error', listener)).toBe(redis);
    await expect(redis.connect()).resolves.toBeUndefined();
    redis.disconnect();
    await expect(redis.quit()).resolves.toBe('OK');
    expect(listener).not.toHaveBeenCalled();
    expect(redis.status).toBe('ready');
  });
});

/**
 * The in-memory client is single-process and non-persistent, so it must never
 * reach a real deployment. `AppConfigService` is the gate, and it fails at
 * boot rather than at the first OTP request.
 */
describe('REDIS_URL=memory guard', () => {
  const configWith = (env: Record<string, string>) =>
    new AppConfigService({ get: (key: string) => env[key] } as unknown as ConfigService);

  it('throws when NODE_ENV=production', () => {
    const config = configWith({ NODE_ENV: 'production', REDIS_URL: MEMORY_REDIS_URL });
    expect(() => config.redisUrl).toThrow(/development-only/);
  });

  it('is allowed outside production', () => {
    expect(configWith({ NODE_ENV: 'development', REDIS_URL: MEMORY_REDIS_URL }).redisUrl).toBe(
      MEMORY_REDIS_URL,
    );
    expect(configWith({ NODE_ENV: 'test', REDIS_URL: MEMORY_REDIS_URL }).redisUrl).toBe(
      MEMORY_REDIS_URL,
    );
  });

  it('defaults to 127.0.0.1 rather than localhost', () => {
    // On Windows `localhost` can resolve to ::1 while the server listens on IPv4.
    expect(configWith({ NODE_ENV: 'production' }).redisUrl).toBe('redis://127.0.0.1:6379/0');
  });
});

/**
 * Wiring: `REDIS_URL=memory` must swap the client, report healthy, and leave
 * every caller working unchanged. This is the whole point of the feature —
 * `OtpService` reads `isAvailable` and answers 503 when it is false.
 */
describe('RedisService with REDIS_URL=memory', () => {
  let warn: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  });

  afterEach(() => warn.mockRestore());

  const service = () =>
    new RedisService({ redisUrl: MEMORY_REDIS_URL } as unknown as AppConfigService);

  it('reports available immediately so OTP does not answer 503', async () => {
    const redis = service();
    expect(redis.isAvailable).toBe(true);

    // Nothing to connect to: onModuleInit must return without touching a socket.
    await expect(redis.onModuleInit()).resolves.toBeUndefined();
    expect(redis.isAvailable).toBe(true);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining('in-process Redis stand-in'));
  });

  it('serves get/set/del through the usual wrappers', async () => {
    const redis = service();

    await redis.set('otp:code', 'hash', 180);
    expect(await redis.get('otp:code')).toBe('hash');

    await redis.del('otp:code');
    expect(await redis.get('otp:code')).toBeNull();
  });

  it('counts rate-limit hits inside one fixed window', async () => {
    jest.useFakeTimers();
    const redis = service();

    expect(await redis.tryIncrement('rl:test', 60)).toEqual({ count: 1, ttlSeconds: 60 });
    jest.advanceTimersByTime(25_000);
    expect(await redis.tryIncrement('rl:test', 60)).toEqual({ count: 2, ttlSeconds: 35 });
    jest.advanceTimersByTime(35_000);
    expect(await redis.tryIncrement('rl:test', 60)).toEqual({ count: 1, ttlSeconds: 60 });

    jest.useRealTimers();
  });

  it('grants a lock once and refuses the second holder', async () => {
    const redis = service();

    expect(await redis.acquireLock('lock:order:1', 30)).toBe(true);
    expect(await redis.acquireLock('lock:order:1', 30)).toBe(false);

    await redis.del('lock:order:1');
    expect(await redis.acquireLock('lock:order:1', 30)).toBe(true);
  });

  it('shuts down without a socket to close', async () => {
    await expect(service().onModuleDestroy()).resolves.toBeUndefined();
  });
});
