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
 * finishPlexSignIn  deletes the cookie and says where to go next
 * ```
 *
 * The plex.tv account token never reaches the browser, and no action takes or
 * returns it.
 */

import { randomUUID } from "node:crypto"
import { cookies } from "next/headers"
import { z } from "zod"

import { getOnboardingStatus } from "@/actions/onboarding"
import { getAccessLevel } from "@/lib/access"
import { publicAction } from "@/lib/actions/define-action"
import { fail, ok } from "@/lib/actions/result"
import { createPin, readPin } from "@/lib/connections/plex-pin"
import { PLEX_PIN_COOKIE, pinCookie, readPinCookie } from "@/lib/plex-pin-cookie"
import { browserClientId, plexAuthUrl, requestHostCheck } from "@/lib/plex-pin-flow"
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
 * (`safeCallbackPath`) is dropped, never stored. With `retry`, a new PIN keeps
 * the invite code and callback path of the cookie it replaces, which the page
 * cannot read. Logs whether the request host is the base URL's host. Limited
 * per client IP (`plex:pin:create`).
 */
export const startPlexSignIn = publicAction({
  input: z.strictObject({
    inviteCode: inviteCodeSchema.optional(),
    callbackPath: z.string().max(2048).optional(),
    retry: z.boolean().optional(),
  }),
  rateLimit: { name: "plex:pin:create" },
  fallbackError: START_FAILED,
  handler: async ({ inviteCode: requestedInvite, callbackPath: requested, retry }) => {
    const jar = await cookies()
    const previous = retry ? readPinCookie(jar.get(PLEX_PIN_COOKIE)?.value) : null
    const inviteCode = requestedInvite ?? previous?.inviteCode
    const clientId = await browserClientId()
    const pin = await createPin(clientId)
    if (!pin.ok) {
      return fail("UPSTREAM_UNAVAILABLE", START_FAILED)
    }

    const callbackPath = safeCallbackPath(requested) ?? previous?.callbackPath
    const attemptId = randomUUID()
    jar.set(pinCookie({ pinId: pin.data.id, code: pin.data.code, clientId, inviteCode, callbackPath, attemptId }))
    logger.info("plex.sign_in_started", { attemptId, retry: Boolean(retry), ...(await requestHostCheck()) })
    return ok({ authUrl: plexAuthUrl(clientId, pin.data.code) })
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
      logger.warn("plex.poll_without_cookie", await requestHostCheck())
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
 * Ends the PIN binding after `signIn("plex")` succeeded, and returns where the
 * member goes next. Without a session it keeps the PIN cookie, so the page can
 * run `signIn` again (next-auth answers `ok` without a session when its CSRF
 * check fails). Where it goes: `/subscribe` without full access (a non-member with Stripe
 * on), `/onboarding` until onboarding is done, otherwise the PIN cookie's
 * `callbackPath` or `/`.
 */
export const finishPlexSignIn = publicAction({
  handler: async (_input, { session }) => {
    const jar = await cookies()
    const pin = readPinCookie(jar.get(PLEX_PIN_COOKIE)?.value)
    const userId = session?.user?.id
    logger.info("plex.sign_in_finished", { attemptId: pin?.attemptId ?? null, hasSession: Boolean(userId) })
    if (!userId) {
      return fail("UNAUTHENTICATED", "Please sign in to continue.")
    }

    const callbackPath = pin?.callbackPath
    jar.delete(PLEX_PIN_COOKIE)
    if ((await getAccessLevel(userId)) !== "full") {
      return ok({ next: "/subscribe" })
    }
    const onboarding = await getOnboardingStatus()
    return ok({ next: onboarding.success && !onboarding.data.isComplete ? "/onboarding" : (callbackPath ?? "/") })
  },
})
