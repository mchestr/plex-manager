/**
 * Signed, expiring cookie values, one key per purpose.
 *
 * ## Format
 *
 * ```
 * base64url(JSON.stringify({ ...payload, exp })) "." base64url(HMAC-SHA256(key, body))
 * ```
 *
 * `exp` is in epoch seconds. Each purpose has its own key, derived from
 * `NEXTAUTH_SECRET` with HKDF, so a value signed for one purpose (a Plex PIN)
 * never verifies for another (a Discord OAuth state). The signature is checked
 * with `timingSafeEqual` before the body is parsed.
 *
 * The values are signed, not encrypted: keep secrets out of the payload.
 *
 * @example
 * ```ts
 * const raw = signValue({ pinId: 42 }, "plex-pin", 900)
 * verifyValue(raw, "plex-pin") // => { pinId: 42 }
 * verifyValue(raw, "discord-oauth") // => null
 * readCookie("a=1; pm-plex-pin=abc", "pm-plex-pin") // => "abc"
 * ```
 *
 * @module lib/security/signed-cookie
 */

import "server-only"

import { createHmac, hkdfSync, timingSafeEqual } from "node:crypto"

import { getEnv } from "@/lib/env"

type Payload = Record<string, unknown>

function purposeKey(purpose: string): Buffer {
  const secret = getEnv().NEXTAUTH_SECRET
  if (!secret) {
    throw new Error("NEXTAUTH_SECRET is not set")
  }
  return Buffer.from(hkdfSync("sha256", secret, "", `plex-manager:signed-cookie:${purpose}`, 32))
}

function sign(body: string, purpose: string): Buffer {
  return createHmac("sha256", purposeKey(purpose)).update(body).digest()
}

/** Signs `payload` for `purpose`, valid for `ttlSec` seconds. */
export function signValue(payload: Payload, purpose: string, ttlSec: number): string {
  const exp = Math.floor(Date.now() / 1000) + ttlSec
  const body = Buffer.from(JSON.stringify({ ...payload, exp })).toString("base64url")
  return `${body}.${sign(body, purpose).toString("base64url")}`
}

/**
 * The payload of a value signed for `purpose`, without `exp`, or `null` when
 * the value is missing, malformed, tampered with, signed for another purpose
 * or expired. Callers still parse the payload with their own schema.
 */
export function verifyValue(raw: string | null | undefined, purpose: string): Payload | null {
  if (!raw) return null
  const [body, signature, extra] = raw.split(".")
  if (!body || !signature || extra !== undefined) return null

  const expected = sign(body, purpose)
  const given = Buffer.from(signature, "base64url")
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null

  let parsed: unknown
  try {
    parsed = JSON.parse(Buffer.from(body, "base64url").toString("utf8"))
  } catch {
    return null
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return null

  const { exp, ...payload } = parsed as Payload
  if (typeof exp !== "number" || exp <= Math.floor(Date.now() / 1000)) return null
  return payload
}

/** One cookie's value from a raw `Cookie` header, for code that has no `cookies()`. */
export function readCookie(header: string | null | undefined, name: string): string | undefined {
  if (!header) return undefined
  for (const part of header.split(";")) {
    const index = part.indexOf("=")
    if (index === -1) continue
    if (part.slice(0, index).trim() !== name) continue
    const value = part.slice(index + 1).trim()
    try {
      return decodeURIComponent(value)
    } catch {
      return value
    }
  }
  return undefined
}
