import "server-only"

/**
 * The bookkeeping behind each GitHub read in `lib/chatbot/knowledge/github`:
 * one bounded map of results per kind of read, and one shared request per key
 * while it is in flight.
 *
 * ## What a read returns without asking GitHub
 *
 * - **A fresh result**, until `ttlMs` has passed since it was read (`Infinity`
 *   at a commit, whose content cannot change).
 * - **A remembered rate limit**, for {@link FAILURE_TTL_MS}, and only for the
 *   same `stamp` (the source's `updatedAt`), so saving the source clears it at
 *   once. Other failures are not kept, so the next call asks again at once.
 * - **The request already in flight** for the same key. A caller that stops
 *   waiting does not cancel it: its result still warms the cache for the next
 *   caller.
 *
 * Results and remembered failures share the map's bound. When it is full, the
 * oldest inserted entry goes first, which only ever costs a re-read.
 *
 * @module lib/chatbot/knowledge/read-cache
 */

/** How long a rate-limited read is remembered, so GitHub is not asked again on every turn. */
const FAILURE_TTL_MS = 60_000

type Outcome = { ok: true } | { ok: false; reason: string }

interface Entry<R> {
  at: number
  /** The source's `updatedAt` when this was read. */
  stamp: number
  result: R
}

interface ReadOptions {
  /** How long a result stays fresh: `Infinity` at a commit. */
  ttlMs: number
  /** The source's `updatedAt`: a remembered failure counts only for the same one. */
  stamp: number
}

/** Sets `key`, dropping the oldest entries beyond `max`. */
function remember<V>(cache: Map<string, V>, key: string, value: V, max: number): void {
  cache.delete(key)
  cache.set(key, value)
  while (cache.size > max) cache.delete(cache.keys().next().value as string)
}

function usable<R extends Outcome>(hit: Entry<R> | undefined, { ttlMs, stamp }: ReadOptions): hit is Entry<R> {
  if (!hit) return false
  const age = Date.now() - hit.at
  return hit.result.ok ? age < ttlMs : hit.stamp === stamp && age < FAILURE_TTL_MS
}

/**
 * A read over one cache of at most `max` entries. `read(key, options, load)`
 * returns the usable entry for `key`, else the request in flight for it, else
 * the result of `load`, which it keeps when it succeeded or was rate-limited.
 */
export function readCache<R extends Outcome>(max: number) {
  const entries = new Map<string, Entry<R>>()
  const pending = new Map<string, Promise<R>>()

  return function read(key: string, options: ReadOptions, load: () => Promise<R>): Promise<R> {
    const hit = entries.get(key)
    if (usable(hit, options)) return Promise.resolve(hit.result)
    const inFlight = pending.get(key)
    if (inFlight) return inFlight

    const request = load()
      .then((result) => {
        if (result.ok || result.reason === "rate_limited") remember(entries, key, { at: Date.now(), stamp: options.stamp, result }, max)
        return result
      })
      .finally(() => pending.delete(key))
    pending.set(key, request)
    return request
  }
}
