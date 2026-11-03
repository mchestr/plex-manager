import "server-only"

/**
 * One limit for every skill catalogue load in the process: at most 8
 * `SKILL.md` reads in flight, however many loads overlap (a timed-out load and
 * the next turn's), since GitHub's secondary rate limit penalises bursts of
 * concurrent requests.
 *
 * A freed slot passes straight to the next task in line, in the order they
 * asked. A queued task whose `signal` has aborted by then is skipped: it
 * resolves `null` without starting.
 *
 * @module lib/chatbot/skills/pool
 */

const SLOTS = 8

let busy = 0
const waiting: Array<() => void> = []

async function acquire(): Promise<void> {
  if (busy < SLOTS) {
    busy += 1
    return
  }
  // release() hands its slot over, so `busy` stays as it is
  await new Promise<void>((resolve) => waiting.push(resolve))
}

function release(): void {
  const next = waiting.shift()
  if (next) next()
  else busy -= 1
}

/**
 * Runs `task` in one of the process's 8 read slots and returns its result, or
 * its error. Resolves `null` without running it when `signal` has aborted.
 */
export async function withReadSlot<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T | null> {
  if (signal?.aborted) return null
  await acquire()
  try {
    // Skipping is not a lost read: a signal aborts only when its load timed
    // out, and that load's result is discarded. A read already started runs
    // on and warms the cache for the next load.
    if (signal?.aborted) return null
    return await task()
  } finally {
    release()
  }
}
