/**
 * The refusals of the item actions (TS 10.1, 10.3) and the small checks that
 * every item action shares: the feature switch, the age of a review, and the
 * errors that stop a write. Server-only.
 *
 * `fail()` of `lib/actions/result.ts` takes only the app's own codes, so the
 * media cleanup codes go through {@link refuse}.
 *
 * @module lib/cleanup/actions/items/result
 */

import "server-only"

import type { ActionErrorCode, ActionFailure, ActionResult } from "@/lib/actions/result"
import { APPROVAL_TTL_MS, CLEANUP_CONFLICT_WORDS, CLEANUP_ERRORS, type CleanupErrorCode } from "@/lib/cleanup/constants"
import { isTransactionConflict } from "@/lib/db/serializable"
import { Prisma } from "@/lib/generated/prisma/client"

/** Every code that an item action can return. */
export type ItemsCode = ActionErrorCode | CleanupErrorCode
export type ItemsFailure = ActionFailure<ItemsCode>
export type ItemsResult<T> = ActionResult<T, ItemsCode>

/** A refusal with the words of TS 10.1. */
export function refuse(code: keyof typeof CLEANUP_ERRORS): ItemsFailure {
  return { success: false, code, error: CLEANUP_ERRORS[code] }
}

/** A refusal with its own words. */
export function refuseWith(code: ItemsCode, error: string): ItemsFailure {
  return { success: false, code, error }
}

/** `CONFLICT` for a Postpone or an Exclude that met a write at the same time (TS 10.1). */
export const itemsConflict = (): ItemsFailure => refuseWith("CONFLICT", CLEANUP_CONFLICT_WORDS.items)

/** `CONFLICT` while another holder has the run claim (TS 8.1 item 4). */
export const runBusy = (): ItemsFailure => refuseWith("CONFLICT", CLEANUP_CONFLICT_WORDS.run)

/** `CLEANUP_OFF` or `CLEANUP_PAUSED` while runs may not change Leaving soon, else null. */
export function liveRefusal(settings: { enabled: boolean; pausedAt: Date | null }): ItemsFailure | null {
  if (!settings.enabled) return refuse("CLEANUP_OFF")
  return settings.pausedAt ? refuse("CLEANUP_PAUSED") : null
}

/** A `reviewedAt` older than 15 minutes, or more than 60 s ahead of `now`, is stale (TS 10.3 step 2). */
export function isStaleReview(reviewedAt: string, now: Date): boolean {
  const at = Date.parse(reviewedAt)
  return Number.isNaN(at) || now.getTime() - at > APPROVAL_TTL_MS || at > now.getTime() + 60_000
}

/**
 * A write that met another writer: a serialization failure or a deadlock
 * (`isTransactionConflict`, architecture-r7-4), or the unique index of an
 * active exclusion that a second Exclude of the same title took first.
 */
export function isWriteConflict(error: unknown): boolean {
  return isTransactionConflict(error) || (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
}

/** Thrown inside the transaction of one key to roll that key back: it counts in `skipped`. */
export class RollbackKey extends Error {
  constructor() {
    super("cleanup.rollback_key")
    this.name = "RollbackKey"
  }
}

/** The distinct keys, in the order given. */
export const distinct = (keys: readonly string[]): string[] => [...new Set(keys)]
