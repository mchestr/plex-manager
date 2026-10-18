/**
 * Typed error codes for a failed Rewind generation.
 *
 * ## Overview
 *
 * `PlexWrapped.error` used to hold free text built from raw exception messages.
 * One of those messages listed every Tautulli user's username and email, and it
 * was rendered to the member (RWP-02, SEC-17, DUP-01). Failures with a known
 * cause now store a code instead, and member surfaces only ever render fixed
 * copy looked up from that code.
 *
 * ## Stored format
 *
 * ```
 * toStoredError("TAUTULLI_USER_NOT_FOUND")  ──► '{"code":"TAUTULLI_USER_NOT_FOUND"}'
 * readStoredError('{"code":"..."}')         ──► that code
 * readStoredError("any legacy free text")   ──► "GENERATION_FAILED"
 * readStoredError(null)                     ──► "GENERATION_FAILED"
 * ```
 *
 * This module is imported by client components, so it must stay free of
 * server-only imports.
 *
 * @module lib/wrapped/generation-errors
 */

import { z } from "zod"

export const REWIND_ERROR_CODES = ["TAUTULLI_USER_NOT_FOUND", "GENERATION_FAILED"] as const

export type RewindErrorCode = (typeof REWIND_ERROR_CODES)[number]

const storedErrorSchema = z.object({ code: z.enum(REWIND_ERROR_CODES) })

const MEMBER_ERROR_COPY: Record<RewindErrorCode, string> = {
  TAUTULLI_USER_NOT_FOUND:
    "We couldn't find your account in Tautulli yet. Ask the server admin to refresh Tautulli's user list.",
  GENERATION_FAILED: "Something went wrong while generating your Wrapped. Please try again.",
}

/**
 * Serialise a code for `PlexWrapped.error`.
 *
 * @example
 * ```ts
 * toStoredError("TAUTULLI_USER_NOT_FOUND") // '{"code":"TAUTULLI_USER_NOT_FOUND"}'
 * ```
 */
export function toStoredError(code: RewindErrorCode): string {
  return JSON.stringify({ code })
}

/**
 * Read `PlexWrapped.error` back as a code. Anything that is not a stored code,
 * including legacy free text and an empty value, reads as `GENERATION_FAILED`,
 * so the stored text itself is never handed to a member surface.
 *
 * @example
 * ```ts
 * readStoredError('{"code":"TAUTULLI_USER_NOT_FOUND"}') // "TAUTULLI_USER_NOT_FOUND"
 * readStoredError("User not found in Tautulli. Available users: ...") // "GENERATION_FAILED"
 * ```
 */
export function readStoredError(error: string | null | undefined): RewindErrorCode {
  if (!error) return "GENERATION_FAILED"
  try {
    const parsed = storedErrorSchema.safeParse(JSON.parse(error))
    return parsed.success ? parsed.data.code : "GENERATION_FAILED"
  } catch {
    return "GENERATION_FAILED"
  }
}

/** Fixed, member-facing copy for a code. */
export function memberErrorCopy(code: RewindErrorCode): string {
  return MEMBER_ERROR_COPY[code]
}

/**
 * Admin-only hint for a code, or `null` when the code has no specific action.
 *
 * @example
 * ```ts
 * adminErrorHint("TAUTULLI_USER_NOT_FOUND", "12345")
 * // "Plex user 12345 is not in Tautulli's user list. Refresh users in Tautulli."
 * ```
 */
export function adminErrorHint(code: RewindErrorCode, plexUserId: string | null): string | null {
  if (code === "TAUTULLI_USER_NOT_FOUND") {
    return `Plex user ${plexUserId ?? "(none)"} is not in Tautulli's user list. Refresh users in Tautulli.`
  }
  return null
}
