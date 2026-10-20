/**
 * The `pm-discord-oauth` cookie binds a Discord authorization to the browser
 * and the account that started it.
 *
 * `/discord/connect` sets it to the SHA-256 of the OAuth `state` and the
 * member's user id, signed for 10 minutes (the state's own lifetime). The
 * callback accepts Discord's redirect only when the cookie verifies, names the
 * signed-in member and hashes to the returned `state`, so an authorize URL
 * started by one account cannot be finished by another.
 *
 * The cookie is httpOnly and SameSite=Lax (Discord returns through a top-level
 * GET, which Strict would strip), scoped to the callback path.
 *
 * @module lib/discord/oauth-cookie
 */

import "server-only"

import { createHash, timingSafeEqual } from "node:crypto"
import { z } from "zod"

import { usesSecureCookies } from "@/lib/env"
import { signValue, verifyValue } from "@/lib/security/signed-cookie"

export const DISCORD_OAUTH_COOKIE = "pm-discord-oauth"

const PURPOSE = "discord-oauth"
const TTL_SEC = 10 * 60
const COOKIE_PATH = "/api/discord/callback"

const payloadSchema = z.object({
  stateHash: z.string().regex(/^[0-9a-f]{64}$/),
  userId: z.string().min(1),
})

interface CookieWrite {
  name: string
  value: string
  httpOnly: true
  sameSite: "lax"
  secure: boolean
  path: typeof COOKIE_PATH
  maxAge: number
}

function hashState(state: string): string {
  return createHash("sha256").update(state).digest("hex")
}

function cookieWrite(value: string, maxAge: number): CookieWrite {
  return {
    name: DISCORD_OAUTH_COOKIE,
    value,
    httpOnly: true,
    sameSite: "lax",
    secure: usesSecureCookies(),
    path: COOKIE_PATH,
    maxAge,
  }
}

/** The cookie for an authorization `userId` just started with `state`. */
export function discordOAuthCookie(state: string, userId: string): CookieWrite {
  return cookieWrite(signValue({ stateHash: hashState(state), userId }, PURPOSE, TTL_SEC), TTL_SEC)
}

/** Deletes the cookie (same name and path, expired). */
export function clearedDiscordOAuthCookie(): CookieWrite {
  return cookieWrite("", 0)
}

/**
 * Whether the raw cookie value verifies, belongs to `userId` and was set for
 * `state`.
 */
export function matchesDiscordOAuthCookie(raw: string | undefined, state: string, userId: string): boolean {
  const parsed = payloadSchema.safeParse(verifyValue(raw, PURPOSE))
  if (!parsed.success || parsed.data.userId !== userId) return false
  return timingSafeEqual(Buffer.from(parsed.data.stateHash, "hex"), Buffer.from(hashState(state), "hex"))
}
