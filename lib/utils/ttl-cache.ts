/**
 * Small in-process caches whose entries expire after a fixed time and whose
 * size is bounded.
 *
 * Expired entries are dropped when they are read. When a cache is full, a new
 * entry evicts the oldest one (insertion order), so the memory a caller can
 * pin is bounded even when the keys come from requests. Each server process
 * has its own copy, which suits short-lived lookups that are cheap to redo
 * after a restart.
 *
 * {@link createLoadingCache} caches the pending load rather than its result,
 * so concurrent callers for a cold key share one load.
 *
 * @example
 * ```ts
 * const cache = createTtlCache<string, number>({ ttlMs: 60_000, maxEntries: 100 })
 * cache.set("a", 1)
 * cache.get("a") // 1
 * cache.get("b") // undefined
 * ```
 */

export interface TtlCache<K, V> {
  /** The cached value, or `undefined` when the key is absent or expired. */
  get(key: K): V | undefined
  /** Stores a value for the cache's TTL, replacing any earlier value. */
  set(key: K, value: V): void
  /** Drops one entry. */
  delete(key: K): void
  /** Drops every entry. */
  clear(): void
}

interface CacheOptions {
  ttlMs: number
  maxEntries: number
}

export function createTtlCache<K, V>({ ttlMs, maxEntries }: CacheOptions): TtlCache<K, V> {
  const entries = new Map<K, { value: V; expiresAt: number }>()

  return {
    get(key) {
      const entry = entries.get(key)
      if (!entry) return undefined
      if (entry.expiresAt <= Date.now()) {
        entries.delete(key)
        return undefined
      }
      return entry.value
    },
    set(key, value) {
      entries.delete(key)
      if (entries.size >= maxEntries) {
        const oldest = entries.keys().next()
        if (!oldest.done) entries.delete(oldest.value)
      }
      entries.set(key, { value, expiresAt: Date.now() + ttlMs })
    },
    delete(key) {
      entries.delete(key)
    },
    clear() {
      entries.clear()
    },
  }
}

export interface LoadingCache<K, V> {
  /**
   * The value for `key`: the cached load (settled or still pending) when it
   * started less than `maxAgeMs` ago (default: the TTL), otherwise a new call
   * to `load`, which then replaces the cached one.
   */
  get(key: K, load: () => Promise<V>, options?: { maxAgeMs?: number }): Promise<V>
  /** Drops one entry, so the next `get` loads again. */
  delete(key: K): void
  /** Drops every entry. */
  clear(): void
}

/**
 * A TTL cache of pending loads. Concurrent callers for a key share one load,
 * so a burst of requests on a cold key makes one upstream call. A load that
 * rejects, or whose value `keep` refuses, is dropped once it settles, so the
 * next call loads again.
 *
 * @example
 * ```ts
 * const cache = createLoadingCache<string, number>({ ttlMs: 60_000, maxEntries: 100 })
 * const load = async () => 42
 * await Promise.all([cache.get("a", load), cache.get("a", load)]) // one call to load
 * ```
 */
export function createLoadingCache<K, V>({
  keep = () => true,
  ...options
}: CacheOptions & { keep?: (value: V) => boolean }): LoadingCache<K, V> {
  const entries = createTtlCache<K, { startedAt: number; value: Promise<V> }>(options)

  return {
    get(key, load, { maxAgeMs = options.ttlMs } = {}) {
      const cached = entries.get(key)
      if (cached && Date.now() - cached.startedAt < maxAgeMs) return cached.value

      const entry = { startedAt: Date.now(), value: load() }
      entries.set(key, entry)
      const drop = () => {
        if (entries.get(key) === entry) entries.delete(key)
      }
      entry.value.then((value) => {
        if (!keep(value)) drop()
      }, drop)
      return entry.value
    },
    delete(key) {
      entries.delete(key)
    },
    clear() {
      entries.clear()
    },
  }
}
