/**
 * The refusals of the Keep and protection actions (TS 10.1) and the small
 * helpers that they share. Server-only.
 *
 * `fail()` of `lib/actions/result.ts` takes only the app's own codes, so the
 * media cleanup codes go through {@link refuse}. A refusal for a title that
 * the member cannot see never says why (TS 10.3 `keepCleanupTitle` step 3).
 *
 * @module lib/cleanup/actions/keeps/result
 */

import "server-only"

import type { ActionErrorCode, ActionFailure, ActionResult } from "@/lib/actions/result"
import { CLEANUP_ERRORS, CLEANUP_UPSTREAM_WORDS, type CleanupErrorCode, keepLimitWords } from "@/lib/cleanup/constants"
import { Prisma } from "@/lib/generated/prisma/client"

/** Every code that a Keep or protection action can return. */
type KeepsCode = ActionErrorCode | CleanupErrorCode
type KeepsFailure = ActionFailure<KeepsCode>
export type KeepsResult<T> = ActionResult<T, KeepsCode>

/** The words of a Keep that is not active, or not the caller's. */
export const KEEP_NOT_FOUND = "This Keep has already ended."
/** The words of an exclusion that is not active. */
export const EXCLUSION_NOT_FOUND = "This exclusion has already ended."
/** The words of an end date before today. */
export const PAST_END_DATE = "Choose today or a later date."

/** A refusal with the words of TS 10.1. */
export function refuse(code: keyof typeof CLEANUP_ERRORS): KeepsFailure {
  return { success: false, code, error: CLEANUP_ERRORS[code] }
}

/** A refusal with its own words. */
export function refuseWith(code: KeepsCode, error: string): KeepsFailure {
  return { success: false, code, error }
}

/** `CLEANUP_KEEP_LIMIT` with the member's limit (TS 10.1). */
export const keepLimit = (limit: number): KeepsFailure => refuseWith("CLEANUP_KEEP_LIMIT", keepLimitWords(limit))

/** plex.tv did not answer, so the app cannot tell what the member sees. The words name no title (integrations-r2-6). */
export const plexSilent = (): KeepsFailure => refuseWith("UPSTREAM_UNAVAILABLE", CLEANUP_UPSTREAM_WORDS.plex)

/** A unique index error (`P2002`): a second write of the same active key or item key took it first. */
export function isUniqueError(error: unknown): boolean {
  return error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002"
}
