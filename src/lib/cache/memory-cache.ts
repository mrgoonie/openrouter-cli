/**
 * Simple in-process TTL cache backed by a Map.
 * Intended for short-lived session caches (e.g. /models responses).
 * Thread-safe within a single JS event loop (no shared state across workers).
 */

type Entry<T> = {
  value: T;
  expiresAt: number;
};

export class MemoryCache {
  private readonly store = new Map<string, Entry<unknown>>();

  /**
   * Return the cached value for `key` if still valid, otherwise call `fn`,
   * cache the result for `ttlMs` milliseconds, and return it.
   */
  async getOrSet<T>(key: string, ttlMs: number, fn: () => Promise<T>): Promise<T> {
    const now = Date.now();
    const existing = this.store.get(key);

    if (existing && existing.expiresAt > now) {
      return existing.value as T;
    }

    const value = await fn();
    this.store.set(key, { value, expiresAt: now + ttlMs });
    return value;
  }

  /**
   * Invalidate a specific key or all keys when called with no argument.
   */
  invalidate(key?: string): void {
    if (key === undefined) {
      this.store.clear();
    } else {
      this.store.delete(key);
    }
  }
}
