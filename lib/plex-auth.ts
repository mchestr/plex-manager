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
import { plexProduct } from "@/lib/brand"
import { createPin, readPin } from "@/lib/connections/plex-pin"
import { getBaseUrl } from "@/lib/env"
import {
  clientCookie,
  PLEX_CLIENT_COOKIE,
  PLEX_PIN_COOKIE,
  pinCookie,
  readClientCookie,
  readPinCookie,
} from "@/lib/plex-pin-cookie"
import { consume } from "@/lib/security/rate-limit"
import { RATE_LIMITED_MESSAGE } from "@/lib/security/rate-limit-messages"
import { createLogger } from "@/lib/utils/logger"
import { safeCallbackPath } from "@/lib/validations/callback-path"
import { inviteCodeSchema } from "@/lib/validations/invite"

const logger = createLogger("PLEX_AUTH")

const START_FAILED = "We couldn't reach Plex. Please try again in a moment."

export type PlexSignInStatus = "waiting" | "ready" | "expired"

/**
 * The app.plex.tv URL that authorises `code` for `clientId`. plex.tv sends
 * the browser back to the callback page with nothing in the URL: the PIN and
 * any invite code stay in the cookie.
 */
function plexAuthUrl(clientId: string, code: string): string {
  // The path is appended, not resolved, so a base URL with a path keeps it.
  const forwardUrl = `${getBaseUrl().replace(/\/+$/, "")}/auth/callback/plex`

  // URLSearchParams writes spaces as "+" (form encoding); plex.tv has always
  // received "%20". A literal "+" is already escaped as "%2B", so every "+"
  // left in the string is a space.
  const queryString = new URLSearchParams({
    clientID: clientId,
    code,
    forwardUrl,
    "context[device][product]": plexProduct,
  })
    .toString()
    .replace(/\+/g, "%20")

  return `https://app.plex.tv/auth#?${queryString}`
}

/**
 * This browser's Plex client identifier, from its signed `pm-plex-client`
 * cookie, or a new random one that is stored for a year. The shared
 * `PLEX_CLIENT_IDENTIFIER` stays for the server's own plex.tv calls.
 */
async function browserClientId(): Promise<string> {
  const jar = await cookies()
  const existing = readClientCookie(jar.get(PLEX_CLIENT_COOKIE)?.value)
  if (existing) return existing
  const clientId = randomUUID()
  jar.set(clientCookie(clientId))
  return clientId
}

/**
 * Starts a Plex sign-in: a strong PIN for this browser, kept in the signed
 * `pm-plex-pin` cookie for 15 minutes together with the optional invite code
 * and `callbackPath` (from `/?callbackUrl=`). A `callbackPath` that is not a same-origin path
 * (`safeCallbackPath`) is dropped, never stored. Limited per client IP
 * (`plex:pin:create`).
 */
export const startPlexSignIn = publicAction({
  input: z.strictObject({ inviteCode: inviteCodeSchema.optional(), callbackPath: z.string().max(2048).optional() }),
  rateLimit: { name: "plex:pin:create" },
  fallbackError: START_FAILED,
  handler: async ({ inviteCode, callbackPath: requested }) => {
    const clientId = await browserClientId()
    const pin = await createPin(clientId)
    if (!pin.ok) {
      return fail("UPSTREAM_UNAVAILABLE", START_FAILED)
    }

    const jar = await cookies()
    const callbackPath = safeCallbackPath(requested) ?? undefined
    jar.set(pinCookie({ pinId: pin.data.id, code: pin.data.code, clientId, inviteCode, callbackPath }))
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
 * member goes next: `/subscribe` without full access (a non-member with Stripe
 * on), `/onboarding` until onboarding is done, otherwise the PIN cookie's
 * `callbackPath` or `/`.
 */
export const finishPlexSignIn = publicAction({
  handler: async (_input, { session }) => {
    const jar = await cookies()
    const callbackPath = readPinCookie(jar.get(PLEX_PIN_COOKIE)?.value)?.callbackPath
    jar.delete(PLEX_PIN_COOKIE)

    const userId = session?.user?.id
    if (!userId) {
      return fail("UNAUTHENTICATED", "Please sign in to continue.")
    }
    if ((await getAccessLevel(userId)) !== "full") {
      return ok({ next: "/subscribe" })
    }
    const onboarding = await getOnboardingStatus()
    return ok({ next: onboarding.success && !onboarding.data.isComplete ? "/onboarding" : (callbackPath ?? "/") })
  },
})
