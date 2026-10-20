/**
 * Client-safe copy and codes for rate-limited steps: sign-in, invites and the assistant.
 * `lib/security/rate-limit.ts` is server-only, so the UI reads these from here.
 */

import { formatDuration } from "@/lib/utils/format"

/** Shown when a sign-in, PIN or invite step is rate-limited. */
export const RATE_LIMITED_MESSAGE = "Too many attempts. Please wait a few minutes and try again."

/**
 * True for the `error` next-auth's `signIn()` returns when a sign-in was
 * rate-limited: `RateLimited` from the per-IP limit on the callback route, or
 * `RATE_LIMITED` from the Jellyfin per-username limit in `authorize`.
 */
export function isRateLimitedSignInError(error: string | null | undefined): boolean {
  return error === "RateLimited" || error === "RATE_LIMITED"
}

/**
 * When a limited caller may try again, from a refusal's `retryAfterSec`:
 * "in 12 minutes", "in 3 hours, 5 minutes". Never less than a minute.
 *
 * @example
 * ```ts
 * retryAfterCopy(30) // "in 1 minute"
 * retryAfterCopy(3 * 3600 + 300) // "in 3 hours, 5 minutes"
 * ```
 */
export function retryAfterCopy(retryAfterSec: number): string {
  return `in ${formatDuration(Math.max(1, Math.ceil(retryAfterSec / 60)), "long", { maxUnits: 2 })}`
}
