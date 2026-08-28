import { describe, expect, it } from 'vitest';

import { TtlCache, createProfileCache } from '../src/utils/cache.js';

const KEY = 'https://www.linkedin.com/in/complete-profile';

describe('TtlCache', () => {
  it('returns undefined for a key it has never seen', () => {
    expect(new TtlCache<string>({ ttlMs: 1000 }).get('missing')).toBeUndefined();
  });

  it('stores and returns a value within its TTL', () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 });
    cache.set(KEY, 'value');
    expect(cache.get(KEY)).toBe('value');
  });

  it('expires an entry once the TTL has elapsed', () => {
    let now = 0;
    const cache = new TtlCache<string>({ ttlMs: 1000, now: () => now });

    cache.set(KEY, 'value');
    now = 999;
    expect(cache.get(KEY)).toBe('value');

    now = 1000;
    expect(cache.get(KEY)).toBeUndefined();
  });

  it('drops the expired entry rather than retaining it', () => {
    let now = 0;
    const cache = new TtlCache<string>({ ttlMs: 100, now: () => now });

    cache.set(KEY, 'value');
    now = 200;
    cache.get(KEY);

    expect(cache.size).toBe(0);
  });

  it('refreshes the expiry when a key is overwritten', () => {
    let now = 0;
    const cache = new TtlCache<string>({ ttlMs: 100, now: () => now });

    cache.set(KEY, 'first');
    now = 50;
    cache.set(KEY, 'second');
    now = 120;

    expect(cache.get(KEY)).toBe('second');
  });

  describe('ttlMs <= 0 disables storage entirely', () => {
    it.each([[0], [-1], [-60_000]])('stores nothing when ttlMs is %i', (ttlMs) => {
      const cache = new TtlCache<string>({ ttlMs });

      cache.set(KEY, 'value');

      expect(cache.disabled).toBe(true);
      expect(cache.get(KEY)).toBeUndefined();
      // Nothing is held in memory at all - it is not stored-then-expired.
      expect(cache.size).toBe(0);
    });
  });

  it('bounds its size, evicting the oldest insertion first', () => {
    const cache = new TtlCache<number>({ ttlMs: 60_000, maxEntries: 3 });

    for (const index of [1, 2, 3, 4]) {
      cache.set(`key-${index}`, index);
    }

    expect(cache.size).toBe(3);
    expect(cache.get('key-1')).toBeUndefined();
    expect(cache.get('key-4')).toBe(4);
  });

  it('supports has, delete and clear', () => {
    const cache = new TtlCache<string>({ ttlMs: 1000 });
    cache.set(KEY, 'value');

    expect(cache.has(KEY)).toBe(true);
    expect(cache.delete(KEY)).toBe(true);
    expect(cache.has(KEY)).toBe(false);

    cache.set(KEY, 'value');
    cache.clear();
    expect(cache.size).toBe(0);
  });
});

describe('createProfileCache', () => {
  it('converts seconds to milliseconds', () => {
    expect(createProfileCache(900).ttlMs).toBe(900_000);
  });

  it('is disabled when CACHE_TTL_SECONDS is 0', () => {
    expect(createProfileCache(0).disabled).toBe(true);
  });
});
