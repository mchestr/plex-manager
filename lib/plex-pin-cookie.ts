/**
 * The two cookies that bind a Plex sign-in to the browser that started it.
 *
 * - `pm-plex-client` holds the browser's own Plex client identifier, a random
 *   UUID signed for one year. plex.tv lists one Plex Manager device per browser.
 * - `pm-plex-pin` holds the PIN being authorised, with its code, that client
 *   identifier, an optional invite code and an optional same-origin path to
 *   land on afterwards, signed for 15 minutes. It is the
 *   only place the PIN id lives: the forward URL carries none.
 *
 * - `pm-setup-plex-pin` holds the PIN of setup's Connect with Plex (P10.25),
 *   signed under its own purpose, so it never finishes a sign-in and a
 *   sign-in PIN never connects a server.
 *
 * All are httpOnly and SameSite=Lax, so plex.tv's top-level redirect back to
 * the callback page still sends them and client JavaScript never reads them.
 *
 * @module lib/plex-pin-cookie
 */

import "server-only"

import { z } from "zod"

import { usesSecureCookies } from "@/lib/env"
import { signValue, verifyValue } from "@/lib/security/signed-cookie"
import { callbackPathSchema } from "@/lib/validations/callback-path"
import { inviteCodeSchema } from "@/lib/validations/invite"

export const PLEX_PIN_COOKIE = "pm-plex-pin"
export const PLEX_CLIENT_COOKIE = "pm-plex-client"
export const SETUP_PLEX_PIN_COOKIE = "pm-setup-plex-pin"

const PIN_PURPOSE = "plex-pin"
const CLIENT_PURPOSE = "plex-client"
const SETUP_PIN_PURPOSE = "setup-plex-pin"
const PIN_TTL_SEC = 15 * 60
const CLIENT_TTL_SEC = 365 * 24 * 60 * 60

const pinCookieSchema = z.object({
  pinId: z.number().int().positive(),
  code: z.string().min(1).max(64),
  clientId: z.uuid(),
  inviteCode: inviteCodeSchema.optional(),
  callbackPath: callbackPathSchema.optional(),
})

export type PlexPinCookie = z.infer<typeof pinCookieSchema>

const setupPinCookieSchema = pinCookieSchema.pick({ pinId: true, code: true, clientId: true })

export type SetupPlexPinCookie = z.infer<typeof setupPinCookieSchema>

const clientCookieSchema = z.object({ clientId: z.uuid() })

interface CookieWrite {
  name: string
  value: string
  httpOnly: true
  sameSite: "lax"
  secure: boolean
  path: "/"
  maxAge: number
}

function cookieWrite(name: string, value: string, maxAge: number): CookieWrite {
  return { name, value, httpOnly: true, sameSite: "lax", secure: usesSecureCookies(), path: "/", maxAge }
}

/** The `pm-plex-pin` cookie for a PIN this browser just created. */
export function pinCookie(pin: PlexPinCookie): CookieWrite {
  return cookieWrite(PLEX_PIN_COOKIE, signValue(pin, PIN_PURPOSE, PIN_TTL_SEC), PIN_TTL_SEC)
}

/** The PIN in a `pm-plex-pin` value, or `null` when it is missing, tampered with or expired. */
export function readPinCookie(raw: string | null | undefined): PlexPinCookie | null {
  const parsed = pinCookieSchema.safeParse(verifyValue(raw, PIN_PURPOSE))
  return parsed.success ? parsed.data : null
}

/** The `pm-plex-client` cookie holding a browser's client identifier. */
export function clientCookie(clientId: string): CookieWrite {
  return cookieWrite(PLEX_CLIENT_COOKIE, signValue({ clientId }, CLIENT_PURPOSE, CLIENT_TTL_SEC), CLIENT_TTL_SEC)
}

/** The client identifier in a `pm-plex-client` value, or `null`. */
export function readClientCookie(raw: string | null | undefined): string | null {
  const parsed = clientCookieSchema.safeParse(verifyValue(raw, CLIENT_PURPOSE))
  return parsed.success ? parsed.data.clientId : null
}

/** The `pm-setup-plex-pin` cookie for setup's Connect with Plex. */
export function setupPinCookie(pin: SetupPlexPinCookie): CookieWrite {
  return cookieWrite(SETUP_PLEX_PIN_COOKIE, signValue(pin, SETUP_PIN_PURPOSE, PIN_TTL_SEC), PIN_TTL_SEC)
}

/** The PIN in a `pm-setup-plex-pin` value, or `null` when it is missing, tampered with or expired. */
export function readSetupPinCookie(raw: string | null | undefined): SetupPlexPinCookie | null {
  const parsed = setupPinCookieSchema.safeParse(verifyValue(raw, SETUP_PIN_PURPOSE))
  return parsed.success ? parsed.data : null
}
