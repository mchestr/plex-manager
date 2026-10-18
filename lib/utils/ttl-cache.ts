/**
 * A small in-process cache whose entries expire after a fixed time and whose
 * size is bounded.
 *
 * Expired entries are dropped when they are read. When the cache is full, a
 * new entry evicts the oldest one (insertion order), so the memory a caller
 * can pin is bounded even when the keys come from requests. Each server
 * process has its own copy, which suits short-lived lookups that are cheap to
 * redo after a restart.
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
  /** Drops every entry. */
  clear(): void
}

export function createTtlCache<K, V>({
  ttlMs,
  maxEntries,
}: {
  ttlMs: number
  maxEntries: number
}): TtlCache<K, V> {
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
    clear() {
      entries.clear()
    },
  }
}
