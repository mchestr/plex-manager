/**
 * The request context every log line carries (BP-17): an AsyncLocalStorage
 * store of `{ requestId, userId }`, set by the proxy, the action and route
 * helpers and the queue workers, and read by `createLogger`.
 *
 * Its own module, apart from the logger, so tests that mock
 * `@/lib/utils/logger` keep the real context. On the client and the Edge
 * runtime there is no store: {@link runWithRequestContext} just runs `fn`.
 *
 * @module lib/utils/log-context
 */

import type { AsyncLocalStorage } from "async_hooks"

export interface LogContext {
  requestId: string
  userId?: string
}

const isNode =
  typeof window === "undefined" &&
  typeof process !== "undefined" &&
  process.env.NEXT_RUNTIME !== "edge" &&
  typeof process.nextTick === "function"

function createStore(): AsyncLocalStorage<LogContext> | null {
  if (!isNode) return null
  try {
    // A conditional require keeps async_hooks out of the client bundle
    const { AsyncLocalStorage: Store } = require("async_hooks") as typeof import("async_hooks")
    return new Store<LogContext>()
  } catch {
    return null
  }
}

const store = createStore()

/** The current request's context, or undefined outside one. */
export function getLogContext(): LogContext | undefined {
  return store?.getStore()
}

/** Runs `fn` with `requestId` and `userId` on every log line inside it, sync or async. */
export function runWithRequestContext<T>(requestId: string, userId: string | undefined, fn: () => T): T {
  return store ? store.run({ requestId, userId }, fn) : fn()
}

/** A new request id: a random UUID, or 32 random hex digits where `randomUUID` is missing (plain http). */
export function generateRequestId(): string {
  const { crypto } = globalThis
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID()
  return Array.from(crypto.getRandomValues(new Uint8Array(16)), (byte) => byte.toString(16).padStart(2, "0")).join("")
}
