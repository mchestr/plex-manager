/**
 * Fetching every card for "Save all" (P8.4): the owner card URLs three at a
 * time under one `AbortSignal`. A 429 waits once for its `retry-after` and
 * tries again; a card that still fails is counted and skipped, so the ZIP
 * keeps the rest. Client-safe.
 *
 * @module lib/rewind/share/save-all
 */

/** Cards fetched at once. */
const SAVE_ALL_CONCURRENCY = 3
/** The wait for a 429 without a usable `retry-after`. */
const DEFAULT_RETRY_S = 2
const MAX_RETRY_S = 30

export interface CardRequest {
  url: string
  /** The entry name in the ZIP. */
  name: string
}

interface CollectOptions {
  signal: AbortSignal
  /** Called with each card's bytes as it arrives. */
  onCard: (name: string, bytes: Uint8Array) => void
  /** Called after each card, saved or failed, with the number done. */
  onProgress: (done: number) => void
  /** Waits `ms`, or rejects when the signal aborts. Injected by tests. */
  sleep?: (ms: number, signal: AbortSignal) => Promise<void>
}

function abortable(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, ms)
    signal.addEventListener("abort", () => {
      clearTimeout(timer)
      reject(signal.reason)
    }, { once: true })
  })
}

/** Seconds to wait from a `retry-after` header: a number of seconds, clamped. @internal */
export function retryAfterSeconds(header: string | null): number {
  if (header === null || header.trim() === "") return DEFAULT_RETRY_S
  const seconds = Number(header)
  return Number.isFinite(seconds) && seconds >= 0 ? Math.min(seconds, MAX_RETRY_S) : DEFAULT_RETRY_S
}

async function fetchCard(url: string, signal: AbortSignal, sleep: NonNullable<CollectOptions["sleep"]>): Promise<Uint8Array | null> {
  let response = await fetch(url, { signal })
  if (response.status === 429) {
    await sleep(retryAfterSeconds(response.headers.get("retry-after")) * 1000, signal)
    response = await fetch(url, { signal })
  }
  return response.ok ? new Uint8Array(await response.arrayBuffer()) : null
}

/**
 * Fetches `cards`, three at a time. Rejects only when the signal aborts.
 *
 * @returns How many cards were saved and how many failed.
 */
export async function collectCards(cards: readonly CardRequest[], { signal, onCard, onProgress, sleep = abortable }: CollectOptions): Promise<{ saved: number; failed: number }> {
  let next = 0
  let done = 0
  let saved = 0
  const worker = async () => {
    while (next < cards.length) {
      const card = cards[next++]
      const bytes = await fetchCard(card.url, signal, sleep).catch((error: unknown) => {
        if (signal.aborted) throw error
        return null
      })
      if (bytes) {
        onCard(card.name, bytes)
        saved++
      }
      onProgress(++done)
    }
  }
  await Promise.all(Array.from({ length: Math.min(SAVE_ALL_CONCURRENCY, cards.length) }, worker))
  return { saved, failed: cards.length - saved }
}
