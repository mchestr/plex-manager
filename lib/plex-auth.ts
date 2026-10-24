"use server"

/**
 * The Server Actions of the Plex sign-in, bound to the browser that started it
 * (SEC-11).
 *
 * ```
 * startPlexSignIn   creates a strong PIN with this browser's client id and
 *                   keeps it in the signed httpOnly pm-plex-pin cookie;
 *                   returns only the app.plex.tv URL
 * pollPlexSignIn    reads that PIN from plex.tv: waiting | ready | expired
 * signIn("plex")    the provider's authorize reads the cookie and the token
 *                   itself (lib/auth.ts), and redeems the invite in it
 * finishPlexSignIn  once the session exists, deletes the cookie and says
 *                   where to go next
 * ```
 *
 * plex.tv sends the browser back to the host it started on (`forwardBaseUrl`),
 * where its host-only PIN cookie lives (#393).
 *
 * The plex.tv account token never reaches the browser, and no action takes or
 * returns it.
 */

import { cookies } from "next/headers"
import { z } from "zod"

import { getOnboardingStatus } from "@/actions/onboarding"
import { getAccessLevel } from "@/lib/access"
import { publicAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { createPin, readPin } from "@/lib/connections/plex-pin"
import { PLEX_PIN_COOKIE, pinCookie, readPinCookie } from "@/lib/plex-pin-cookie"
import { browserClientId, forwardBaseUrl, plexAuthUrl } from "@/lib/plex-pin-flow"
import { consume } from "@/lib/security/rate-limit"
import { RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"
import { createLogger } from "@/lib/utils/logger"
import { safeCallbackPath } from "@/lib/validations/callback-path"
import { inviteCodeSchema } from "@/lib/validations/invite"

const logger = createLogger("PLEX_AUTH")

const START_FAILED = "We couldn't reach Plex. Please try again in a moment."

export type PlexSignInStatus = "waiting" | "ready" | "expired"

/**
 * Starts a Plex sign-in: a strong PIN for this browser, kept in the signed
 * `pm-plex-pin` cookie for 15 minutes together with the optional invite code
 * and `callbackPath` (from `/?callbackUrl=`). A `callbackPath` that is not a same-origin path
 * (`safeCallbackPath`) is dropped, never stored. Limited per client IP
 * (`plex:pin:create`).
 *
 * `retry` is the callback page's Try again: the invite code and callback path
 * of the sign-in that did not finish carry over from its signed cookie, so an
 * invitee's second attempt still redeems the invite.
 */
export const startPlexSignIn = publicAction({
  input: z.strictObject({
    inviteCode: inviteCodeSchema.optional(),
    callbackPath: z.string().max(2048).optional(),
    retry: z.literal(true).optional(),
  }),
  rateLimit: { name: "plex:pin:create" },
  fallbackError: START_FAILED,
  handler: async ({ inviteCode: requestedInvite, callbackPath: requestedPath, retry }) => {
    const jar = await cookies()
    const previous = retry ? readPinCookie(jar.get(PLEX_PIN_COOKIE)?.value) : null
    const inviteCode = requestedInvite ?? previous?.inviteCode
    const callbackPath = safeCallbackPath(requestedPath) ?? previous?.callbackPath

    const clientId = await browserClientId()
    const pin = await createPin(clientId)
    if (!pin.ok) {
      return fail("UPSTREAM_UNAVAILABLE", START_FAILED)
    }

    const { baseUrl, onBaseHost } = await forwardBaseUrl()
    logger.info("auth.plex_sign_in_started", { onBaseHost, retry: retry === true, carriedOver: previous !== null })
    jar.set(pinCookie({ pinId: pin.data.id, code: pin.data.code, clientId, inviteCode, callbackPath }))
    return ok({ authUrl: plexAuthUrl(clientId, pin.data.code, baseUrl) })
  },
})

/**
 * Whether plex.tv has authorised the PIN in this browser's cookie. A request
 * without a valid cookie is `expired` and reaches no PIN. Limited per client
 * IP and per PIN (`plex:pin:poll`). A plex.tv hiccup reads as `waiting`, so
 * the page keeps polling.
 */
export const pollPlexSignIn = publicAction({
  rateLimit: { name: "plex:pin:poll" },
  handler: async () => {
    const pin = readPinCookie((await cookies()).get(PLEX_PIN_COOKIE)?.value)
    if (!pin) {
      const { onBaseHost } = await forwardBaseUrl()
      logger.warn("auth.plex_poll_without_pin", { onBaseHost })
      return ok<{ status: PlexSignInStatus }>({ status: "expired" })
    }

    const limit = await consume("plex:pin:poll", `pin:${pin.pinId}`)
    if (!limit.ok) {
      logger.warn("Plex PIN poll rate-limited")
      return fail("RATE_LIMITED", RATE_LIMITED_MESSAGE, { retryAfterSec: limit.retryAfterSec })
    }

    const { status } = await readPin(pin.pinId, pin.code, pin.clientId)
    return ok<{ status: PlexSignInStatus }>({ status: status === "unavailable" ? "waiting" : status })
  },
})

/**
 * Ends the PIN binding once `signIn("plex")` has set a session, and returns
 * where the member goes next: `/subscribe` without full access (a non-member
 * with Stripe on), `/onboarding` until onboarding is done, otherwise the PIN
 * cookie's `callbackPath` or `/`.
 *
 * next-auth's `signIn` reports `ok` without setting a session when its CSRF
 * check fails (#393). Without a session the cookie is kept, so the callback
 * page can sign in again with the same PIN and Try again keeps its invite.
 */
export const finishPlexSignIn = publicAction({
  handler: async (_input, { session }) => {
    const userId = session?.user?.id
    logger.info("auth.plex_sign_in_finished", { hasSession: Boolean(userId) })
    if (!userId) {
      return fail("UNAUTHENTICATED", "Please sign in to continue.")
    }

    const jar = await cookies()
    const callbackPath = readPinCookie(jar.get(PLEX_PIN_COOKIE)?.value)?.callbackPath
    jar.delete(PLEX_PIN_COOKIE)
    if ((await getAccessLevel(userId)) !== "full") {
      return ok({ next: "/subscribe" })
    }
    const onboarding = await getOnboardingStatus()
    return ok({ next: onboarding.success && !onboarding.data.isComplete ? "/onboarding" : (callbackPath ?? "/") })
  },
})
