/**
 * Helpers for `'use cache'` functions (P11.19).
 *
 * A `'use cache'` function throws outside a Next request ("cannot be used
 * outside of App Router"): the Discord bot, the queue workers and scripts
 * call the same readers. {@link cachedOrDirect} runs the cached reader in a
 * request and the plain one everywhere else.
 *
 * @module lib/utils/use-cache
 */

import "server-only"

import { connection } from "next/server"

const OUTSIDE_APP_ROUTER = /"use cache" cannot be used outside of App Router/

/**
 * `cached()` in a request; `direct()` where `'use cache'` is unavailable.
 * Any other error from `cached()` is rethrown.
 */
export async function cachedOrDirect<T>(cached: () => Promise<T>, direct: () => Promise<T>): Promise<T> {
  try {
    return await cached()
  } catch (error) {
    if (error instanceof Error && OUTSIDE_APP_ROUTER.test(error.message)) return direct()
    throw error
  }
}

/**
 * Defers the caller to request time while `next build` prerenders. Cached
 * readers that query the database call it first: the Docker build has no
 * database, and a value read at build would be baked into the static shell.
 * A no-op at run time, so jobs and the bot are unaffected.
 */
export async function notDuringBuild(): Promise<void> {
  if (process.env.NEXT_PHASE === "phase-production-build") await connection()
}
