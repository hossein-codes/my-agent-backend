import { MemoryRedis } from './memory-redis';

/**
 * The in-memory store stands in for Redis in development, so it has to match
 * real Redis semantics on the commands this codebase relies on. The OTP and
 * rate-limit services are correct only if TTLs, `NX` and `incr` behave exactly
 * as they do against a real server.
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

  describe('get/set', () => {
    it('stores and returns a value', async () => {
      await redis.set('k', 'v');
      await expect(redis.get('k')).resolves.toBe('v');
    });

    it('returns null for a key that was never set', async () => {
      await expect(redis.get('missing')).resolves.toBeNull();
    });

    it('expires a key once its EX window has passed', async () => {
      await redis.set('otp', 'hash', 'EX', 180);

      jest.advanceTimersByTime(179_000);
      await expect(redis.get('otp')).resolves.toBe('hash');

      jest.advanceTimersByTime(2_000);
      await expect(redis.get('otp')).resolves.toBeNull();
    });
  });

  describe('NX (used by acquireLock)', () => {
    it('refuses to overwrite a live key and reports null', async () => {
      await expect(redis.set('lock', '1', 'EX', 30, 'NX')).resolves.toBe('OK');
      await expect(redis.set('lock', '2', 'EX', 30, 'NX')).resolves.toBeNull();
      await expect(redis.get('lock')).resolves.toBe('1');
    });

    it('allows a fresh acquire once the previous lock has expired', async () => {
      await redis.set('lock', '1', 'EX', 30, 'NX');
      jest.advanceTimersByTime(31_000);
      await expect(redis.set('lock', '2', 'EX', 30, 'NX')).resolves.toBe('OK');
    });
  });

  describe('incr', () => {
    it('counts up from zero for an unknown key', async () => {
      await expect(redis.incr('attempts')).resolves.toBe(1);
      await expect(redis.incr('attempts')).resolves.toBe(2);
    });

    it('keeps the existing TTL — the window must not slide on each hit', async () => {
      await redis.incr('rl');
      await redis.expire('rl', 60);

      jest.advanceTimersByTime(30_000);
      await redis.incr('rl');

      // 30s consumed, so ~30s remain rather than a refreshed 60s.
      await expect(redis.ttl('rl')).resolves.toBe(30);
    });
  });

  describe('ttl', () => {
    it('returns -2 for a missing key and -1 when no TTL is set', async () => {
      await expect(redis.ttl('nope')).resolves.toBe(-2);
      await redis.set('permanent', 'v');
      await expect(redis.ttl('permanent')).resolves.toBe(-1);
    });
  });

  describe('expire with NX', () => {
    it('does not replace a TTL that already exists', async () => {
      await redis.set('k', 'v', 'EX', 100);
      await expect(redis.expire('k', 500, 'NX')).resolves.toBe(0);
      await expect(redis.ttl('k')).resolves.toBe(100);
    });
  });

  describe('del', () => {
    it('reports whether the key was actually present', async () => {
      await redis.set('k', 'v');
      await expect(redis.del('k')).resolves.toBe(1);
      await expect(redis.del('k')).resolves.toBe(0);
    });
  });

  describe('multi (used by tryIncrement)', () => {
    it('returns ioredis-shaped [error, result] tuples in order', async () => {
      const result = await redis.multi().incr('rl').expire('rl', 60, 'NX').ttl('rl').exec();

      expect(result).toEqual([
        [null, 1],
        [null, 1],
        [null, 60],
      ]);
    });

    it('sets the window only on the first hit', async () => {
      await redis.multi().incr('rl').expire('rl', 60, 'NX').ttl('rl').exec();
      jest.advanceTimersByTime(10_000);
      const second = await redis.multi().incr('rl').expire('rl', 60, 'NX').ttl('rl').exec();

      expect(second[0]).toEqual([null, 2]);
      expect(second[2]).toEqual([null, 50]); // not reset to 60
    });
  });
});
