/**
 * The token in an email's unsubscribe links (`/api/email/unsubscribe` and
 * `/email/unsubscribe`). It is a signed value of `lib/security/signed-cookie`:
 *
 * ```
 * signValue({ u: userId }, "email-unsubscribe", 365 days)
 * ```
 *
 * The key comes from `NEXTAUTH_SECRET` with HKDF, under the purpose
 * `email-unsubscribe`, so no other signed value (a sign-in PIN, an OAuth
 * state) passes as a token, and a token passes as nothing else. The app
 * stores nothing for it. A new `NEXTAUTH_SECRET` stops every token already
 * sent; the member can still turn the emails off on Account after a sign-in.
 *
 * The payload holds the member id only, never a name or an address. The
 * token can only turn the emails off: every caller that checks it passes
 * `enabled: false`, and only the signed-in Account card turns them on.
 *
 * @module lib/security/unsubscribe-token
 */

import "server-only"

import { z } from "zod"

import { signValue, verifyValue } from "@/lib/security/signed-cookie"

const PURPOSE = "email-unsubscribe"

/** 365 days: the law in Canada asks for a link that works at least 60 days after the send. @internal Tests check the expiry. */
export const UNSUBSCRIBE_TOKEN_TTL_SEC = 365 * 24 * 60 * 60

/** The longest token the routes read; a real one is about 100 characters. */
export const MAX_UNSUBSCRIBE_TOKEN_LENGTH = 512

const payloadSchema = z.strictObject({ u: z.string().min(1).max(64) })

/** A token for `userId`'s unsubscribe links, valid for {@link UNSUBSCRIBE_TOKEN_TTL_SEC}. */
export function signUnsubscribeToken(userId: string): string {
  return signValue({ u: userId }, PURPOSE, UNSUBSCRIBE_TOKEN_TTL_SEC)
}

/**
 * The member id in `token`, or null when the token is missing, too long,
 * changed, expired, signed for another purpose or with another
 * `NEXTAUTH_SECRET`, or holds anything but the member id.
 */
export function verifyUnsubscribeToken(token: string | null | undefined): string | null {
  if (!token || token.length > MAX_UNSUBSCRIBE_TOKEN_LENGTH) return null
  const parsed = payloadSchema.safeParse(verifyValue(token, PURPOSE))
  return parsed.success ? parsed.data.u : null
}
