/**
 * Unit tests for MemoryCache TTL behaviour.
 */

import { afterEach, beforeEach, describe, expect, test } from 'bun:test';
import { MemoryCache } from '../../../src/lib/cache/memory-cache.ts';

describe('MemoryCache.getOrSet', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  test('calls fn on first access and returns its value', async () => {
    let calls = 0;
    const value = await cache.getOrSet('k', 1000, async () => {
      calls++;
      return 'hello';
    });
    expect(value).toBe('hello');
    expect(calls).toBe(1);
  });

  test('returns cached value without calling fn again within TTL', async () => {
    let calls = 0;
    await cache.getOrSet('k', 1000, async () => {
      calls++;
      return 42;
    });
    const value = await cache.getOrSet('k', 1000, async () => {
      calls++;
      return 99;
    });
    expect(value).toBe(42);
    expect(calls).toBe(1);
  });

  test('calls fn again after TTL expires', async () => {
    let calls = 0;
    await cache.getOrSet('k', 1, async () => {
      calls++;
      return 'first';
    });
    // Wait for TTL to expire
    await new Promise((r) => setTimeout(r, 10));
    const value = await cache.getOrSet('k', 1, async () => {
      calls++;
      return 'second';
    });
    expect(value).toBe('second');
    expect(calls).toBe(2);
  });

  test('different keys are cached independently', async () => {
    const a = await cache.getOrSet('a', 1000, async () => 1);
    const b = await cache.getOrSet('b', 1000, async () => 2);
    expect(a).toBe(1);
    expect(b).toBe(2);
  });
});

describe('MemoryCache.invalidate', () => {
  let cache: MemoryCache;

  beforeEach(() => {
    cache = new MemoryCache();
  });

  test('invalidate(key) forces re-fetch on next access', async () => {
    let calls = 0;
    await cache.getOrSet('k', 60_000, async () => {
      calls++;
      return 'v1';
    });
    cache.invalidate('k');
    await cache.getOrSet('k', 60_000, async () => {
      calls++;
      return 'v2';
    });
    expect(calls).toBe(2);
  });

  test('invalidate() with no arg clears all entries', async () => {
    let calls = 0;
    await cache.getOrSet('a', 60_000, async () => {
      calls++;
      return 'a';
    });
    await cache.getOrSet('b', 60_000, async () => {
      calls++;
      return 'b';
    });
    cache.invalidate();
    await cache.getOrSet('a', 60_000, async () => {
      calls++;
      return 'a2';
    });
    await cache.getOrSet('b', 60_000, async () => {
      calls++;
      return 'b2';
    });
    expect(calls).toBe(4);
  });

  test('invalidating non-existent key is a no-op', () => {
    expect(() => cache.invalidate('missing')).not.toThrow();
  });
});
