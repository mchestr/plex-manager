/**
 * The one result shape every migrated Server Action returns.
 *
 * `success` is the discriminant, so callers written against the older
 * `{ success, error }` objects keep compiling while they move over. A failure
 * always carries an {@link ActionErrorCode} and copy that is safe to show:
 * internal error text is logged by {@link toActionError}, never returned
 * (SEC-20).
 *
 * @module lib/actions/result
 */

import "server-only"

import { Prisma } from "@/lib/generated/prisma/client"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("ACTION")

/**
 * Why an action refused or failed. P3.8's `errorCopy` maps every code, and
 * P4.5 starts returning `NOT_ENTITLED`. `INVITE_INVALID` and
 * `INVITE_WRONG_SERVICE` are the invite codes P4.12 introduced.
 * `SETUP_UNCLAIMED` refuses a setup action before this browser claimed the
 * server with the setup code (P11.32).
 */
export type ActionErrorCode =
  | "UNAUTHENTICATED"
  | "FORBIDDEN"
  | "VALIDATION"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "NOT_ENTITLED"
  | "CONFLICT"
  | "UPSTREAM_UNAVAILABLE"
  | "INVITE_INVALID"
  | "INVITE_WRONG_SERVICE"
  | "SETUP_UNCLAIMED"
  | "INTERNAL"

/**
 * A refusal or failure. `C` widens the code for an action with a vocabulary of
 * its own, such as the Rewind generation refusals.
 */
export interface ActionFailure<C extends string = ActionErrorCode> {
  success: false
  code: C
  error: string
  fieldErrors?: Record<string, string[]>
  retryAfterSec?: number
}

export type ActionResult<T, C extends string = ActionErrorCode> = { success: true; data: T } | ActionFailure<C>

/** A successful result carrying `data`. */
export function ok<T>(data: T): { success: true; data: T } {
  return { success: true, data }
}

/** A failed result with a code and user-facing copy. */
export function fail(
  code: ActionErrorCode,
  error: string,
  extra: Pick<ActionFailure, "fieldErrors" | "retryAfterSec"> = {}
): ActionFailure {
  return { success: false, code, error, ...extra }
}

/**
 * Maps a thrown error to a failure without exposing its text.
 *
 * Logs the full error, then returns `NOT_FOUND` for Prisma's `P2025` (record
 * not found), `CONFLICT` for `P2002` (unique constraint) and `INTERNAL` with
 * `fallback` for everything else. `error.message` is never returned.
 *
 * @example
 * ```ts
 * toActionError(new Error("Can't reach database server at db:5432"), "Failed to save")
 * // { success: false, code: "INTERNAL", error: "Failed to save" }
 * ```
 */
export function toActionError(error: unknown, fallback: string): ActionFailure {
  logger.error("Action failed", error)

  if (error instanceof Prisma.PrismaClientKnownRequestError) {
    if (error.code === "P2025") return fail("NOT_FOUND", "That item no longer exists.")
    if (error.code === "P2002") return fail("CONFLICT", "That already exists.")
  }

  return fail("INTERNAL", fallback)
}
