/**
 * The outcomes of a Plex sign-in that the callback page shows, by code.
 * Client-safe: the Plex provider's `authorize` throws these codes as error
 * messages, and next-auth's `signIn()` hands them back to the page, so no
 * server text ever reaches the screen.
 *
 * - `access_denied` sends the member to `/auth/denied`. A failed access check
 *   is always this code, whatever the Stripe flag.
 * - The rest are shown on the callback page's StatusScreen with the copy
 *   below; every one but `invite_invalid` offers Try again.
 *
 * A non-member with Stripe on is not a failure: they sign in, and
 * `finishPlexSignIn` sends them to `/subscribe`.
 *
 * @module lib/plex-sign-in-codes
 */

import { isRateLimitedSignInError, RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"

export type PlexSignInCode =
  | "plex_pin_expired"
  | "access_denied"
  | "invite_invalid"
  | "rate_limited"
  | "sign_in_failed"

/** Codes the callback page shows itself. */
export type ShownPlexSignInCode = Exclude<PlexSignInCode, "access_denied">

export const PLEX_SIGN_IN_COPY: Record<ShownPlexSignInCode, { title: string; message: string }> = {
  plex_pin_expired: {
    title: "Sign-in didn't finish",
    message: "This sign-in expired or was started in another browser. Try again to start a new one.",
  },
  invite_invalid: {
    title: "This invite can't be used",
    message: "This invite can't be used. It may have expired, been used up, or be for another server.",
  },
  rate_limited: { title: "Too many attempts", message: RATE_LIMITED_MESSAGE },
  sign_in_failed: {
    title: "Sign-in didn't finish",
    message: "We couldn't sign you in with Plex. Please try again.",
  },
}

const AUTHORIZE_CODES = new Set<string>(["plex_pin_expired", "access_denied", "invite_invalid"])

/** The code for the `error` that next-auth's `signIn("plex")` returned. */
export function plexSignInCodeFor(error: string | null | undefined): PlexSignInCode {
  if (isRateLimitedSignInError(error)) return "rate_limited"
  if (error && AUTHORIZE_CODES.has(error)) return error as PlexSignInCode
  return "sign_in_failed"
}
