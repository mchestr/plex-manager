/**
 * Client-safe copy and codes for rate-limited sign-in and invite steps.
 * `lib/security/rate-limit.ts` is server-only, so the UI reads these from here.
 */

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
