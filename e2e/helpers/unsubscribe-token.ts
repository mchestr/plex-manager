import { createHmac, hkdfSync } from 'node:crypto';

/**
 * Signs an unsubscribe token the way the app does
 * (`lib/security/unsubscribe-token.ts` over `lib/security/signed-cookie.ts`),
 * with the test `NEXTAUTH_SECRET`, so a spec can open a member's link
 * without sending an email first.
 */

/** 2100-01-01 and 2000-01-01, in epoch seconds: fixed, so a path made at load time is the same in every worker. */
export const FAR_FUTURE = 4_102_444_800;
export const LONG_AGO = 946_684_800;

/** A token for `userId` that expires at `exp` (epoch seconds), by default in 365 days. */
export function signUnsubscribeToken(userId: string, exp = Math.floor(Date.now() / 1000) + 365 * 24 * 60 * 60): string {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) throw new Error('NEXTAUTH_SECRET must be set to sign an E2E unsubscribe token.');
  const key = Buffer.from(hkdfSync('sha256', secret, '', 'plex-manager:signed-cookie:email-unsubscribe', 32));
  const body = Buffer.from(JSON.stringify({ u: userId, exp })).toString('base64url');
  return `${body}.${createHmac('sha256', key).update(body).digest('base64url')}`;
}

/** The page link that an email to `userId` holds. */
export const unsubscribePath = (userId: string, exp?: number) => `/email/unsubscribe?token=${signUnsubscribeToken(userId, exp)}`;
