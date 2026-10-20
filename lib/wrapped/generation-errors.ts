/**
 * Typed error codes for a failed Rewind generation.
 *
 * ## Overview
 *
 * `PlexWrapped.error` used to hold free text built from raw exception messages.
 * One of those messages listed every Tautulli user's username and email, and it
 * was rendered to the member (RWP-02, SEC-17, DUP-01). Failures with a known
 * cause now store a code instead, and member surfaces only ever render fixed
 * copy looked up from that code through `errorCopy` (`lib/ui/error-copy.ts`).
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

/**
 * P0.9's codes, then the generation job's (P2.17): `TIMEOUT` (the 5-minute
 * limit), `UPSTREAM_ERROR` (Tautulli, Plex or Overseerr failed), `LLM_FAILED`,
 * `NOT_CONFIGURED` (no active Plex, Tautulli or LLM provider), `WORKER_LOST`
 * (the run stopped with its worker) and `JOB_LOST` (the queued job vanished).
 */
const REWIND_ERROR_CODES = [
  "TAUTULLI_USER_NOT_FOUND",
  "GENERATION_FAILED",
  "TIMEOUT",
  "UPSTREAM_ERROR",
  "LLM_FAILED",
  "NOT_CONFIGURED",
  "WORKER_LOST",
  "JOB_LOST",
] as const

export type RewindErrorCode = (typeof REWIND_ERROR_CODES)[number]

const storedErrorSchema = z.object({ code: z.enum(REWIND_ERROR_CODES) })

/**
 * Read `RewindGeneration.error` (`{ code }`) back as a code; anything else,
 * including a skip reason such as `LOCKED`, reads as `GENERATION_FAILED`.
 *
 * @example
 * ```ts
 * readGenerationError({ code: "TIMEOUT" }) // "TIMEOUT"
 * readGenerationError(null) // "GENERATION_FAILED"
 * ```
 */
export function readGenerationError(error: unknown): RewindErrorCode {
  const parsed = storedErrorSchema.safeParse(error)
  return parsed.success ? parsed.data.code : "GENERATION_FAILED"
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

/**
 * Admin-only hint for a stored code or an ineligible member, or `null` when
 * the code has no specific action.
 *
 * A member with a `plexUserId` is ineligible only when Tautulli has no row for
 * them. That answer is cached for 10 minutes (`lib/wrapped/eligibility.ts`),
 * so the hint says when to try again.
 *
 * @example
 * ```ts
 * adminErrorHint("TAUTULLI_USER_NOT_FOUND", "12345")
 * // "Plex user 12345 is not in Tautulli's user list. Refresh users in Tautulli."
 * adminErrorHint("REWIND_NOT_ELIGIBLE", null)
 * // "This member has no linked Plex account, so there is no watch history for a Rewind."
 * ```
 */
export function adminErrorHint(
  code: RewindErrorCode | "REWIND_NOT_ELIGIBLE",
  plexUserId: string | null
): string | null {
  switch (code) {
    case "TAUTULLI_USER_NOT_FOUND":
      return `Plex user ${plexUserId ?? "(none)"} is not in Tautulli's user list. Refresh users in Tautulli.`
    case "REWIND_NOT_ELIGIBLE":
      return plexUserId
        ? `Plex user ${plexUserId} is not in Tautulli's user list. Refresh users in Tautulli, then try again in 10 minutes.`
        : "This member has no linked Plex account, so there is no watch history for a Rewind."
    case "NOT_CONFIGURED":
      return "Plex, Tautulli or the LLM provider is not configured. Check the settings, then regenerate."
    case "TIMEOUT":
      return "The run hit its 5-minute limit. Check that Tautulli and the LLM provider respond quickly."
    case "UPSTREAM_ERROR":
      return "Tautulli, Plex or Overseerr failed after three attempts. Check that they are reachable."
    case "GENERATION_FAILED":
    case "LLM_FAILED":
    case "WORKER_LOST":
    case "JOB_LOST":
      return null
  }
}

/**
 * Codes for a run `requestRewindGeneration` refused to start (SEC-22, RWP-12), or
 * for a member who cannot have a Rewind (FR-48, RWP-08). They are returned to
 * the caller and never stored.
 */
const GENERATION_REFUSAL_CODES = [
  "ALREADY_GENERATING",
  "RATE_LIMITED",
  "NOT_ENTITLED",
  "REWIND_NOT_ELIGIBLE",
] as const

export type GenerationRefusalCode = (typeof GENERATION_REFUSAL_CODES)[number]

/** True for a refusal code, false for a stored failure code or none. */
export function isGenerationRefusal(code: string | undefined): code is GenerationRefusalCode {
  return GENERATION_REFUSAL_CODES.some((refusal) => refusal === code)
}

/** "in 1 minute", "in 10 minutes", "in 3 hours": rounded up, never "in 0". */
function retryAfterPhrase(seconds: number): string {
  const minutes = Math.max(1, Math.ceil(seconds / 60))
  if (minutes < 60) {
    return minutes === 1 ? "in 1 minute" : `in ${minutes} minutes`
  }
  const hours = Math.ceil(minutes / 60)
  return hours === 1 ? "in 1 hour" : `in ${hours} hours`
}

/**
 * Fixed, member-facing copy for a refused run.
 *
 * @param retryAfterSec - for `RATE_LIMITED`, the seconds until the next run is allowed
 *
 * @example
 * ```ts
 * refusalCopy("ALREADY_GENERATING") // "Your Rewind is already being made."
 * refusalCopy("RATE_LIMITED", 540)  // "You can try again in 9 minutes."
 * refusalCopy("RATE_LIMITED", 7200) // "You can try again in 2 hours."
 * refusalCopy("REWIND_NOT_ELIGIBLE") // "Rewind needs Plex watch history. Jellyfin support is planned."
 * ```
 */
export function refusalCopy(code: GenerationRefusalCode, retryAfterSec = 60): string {
  switch (code) {
    case "ALREADY_GENERATING":
      return "Your Rewind is already being made."
    case "RATE_LIMITED":
      return `You can try again ${retryAfterPhrase(retryAfterSec)}.`
    case "NOT_ENTITLED":
      return "Rewind is part of an active membership. Renew your subscription to make yours."
    case "REWIND_NOT_ELIGIBLE":
      return "Rewind needs Plex watch history. Jellyfin support is planned."
  }
}
