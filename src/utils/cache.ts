/**
 * In-process TTL cache, keyed on the canonical profile URL.
 *
 * Deliberately not Redis. A single-instance read API does not need a network
 * hop and a second deployable to demonstrate caching, and the limitation -
 * cache is per instance and dies with the process - is documented rather than
 * engineered around.
 */

interface CacheEntry<T> {
  readonly value: T;
  readonly expiresAt: number;
}

export interface TtlCacheOptions {
  /** Entry lifetime. `<= 0` disables storage entirely. */
  readonly ttlMs: number;
  /**
   * Upper bound on retained entries. The key space is attacker-influenced -
   * every distinct valid slug is a distinct key - so the cache is bounded to
   * keep a burst of unique URLs from growing the heap without limit. Eviction
   * is oldest-insertion-first.
   */
  readonly maxEntries?: number;
  /** Injectable clock. Tests drive expiry without sleeping. */
  readonly now?: () => number;
}

const DEFAULT_MAX_ENTRIES = 1000;

export class TtlCache<T> {
  readonly ttlMs: number;

  private readonly maxEntries: number;
  private readonly now: () => number;
  /** Map preserves insertion order, which is what makes eviction trivial. */
  private readonly entries = new Map<string, CacheEntry<T>>();

  constructor(options: TtlCacheOptions) {
    this.ttlMs = options.ttlMs;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
    this.now = options.now ?? Date.now;
  }

  /** `true` when caching is switched off, i.e. `CACHE_TTL_SECONDS=0`. */
  get disabled(): boolean {
    return this.ttlMs <= 0;
  }

  get size(): number {
    return this.entries.size;
  }

  get(key: string): T | undefined {
    if (this.disabled) return undefined;

    const entry = this.entries.get(key);
    if (entry === undefined) return undefined;

    if (entry.expiresAt <= this.now()) {
      // Expired entries are dropped on read rather than swept on a timer: no
      // background work, and nothing keeps the event loop alive.
      this.entries.delete(key);
      return undefined;
    }

    return entry.value;
  }

  set(key: string, value: T): void {
    // A disabled cache stores nothing at all. It does not store-and-expire, so
    // no value ever sits in memory when caching is off.
    if (this.disabled) return;

    // Re-insert so an overwritten key counts as newest for eviction.
    this.entries.delete(key);
    this.entries.set(key, { value, expiresAt: this.now() + this.ttlMs });

    while (this.entries.size > this.maxEntries) {
      const oldest = this.entries.keys().next();
      if (oldest.done === true) break;
      this.entries.delete(oldest.value);
    }
  }

  has(key: string): boolean {
    return this.get(key) !== undefined;
  }

  delete(key: string): boolean {
    return this.entries.delete(key);
  }

  clear(): void {
    this.entries.clear();
  }
}

/** Builds a cache from the configured TTL in seconds. */
export function createProfileCache<T>(cacheTtlSeconds: number): TtlCache<T> {
  return new TtlCache<T>({ ttlMs: cacheTtlSeconds * 1000 });
}
