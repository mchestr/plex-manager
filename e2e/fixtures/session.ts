import { test as base, type BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { createE2EPrismaClient } from '../helpers/prisma';

/**
 * Signs a browser context in by minting the NextAuth session cookie directly,
 * instead of going through the Plex callback page. Works against `next dev`
 * and a production build alike, and needs no application code.
 *
 * The token carries `checkedAt: 0`, so the first request's jwt callback
 * treats it as stale and re-reads the seeded row's admin flag and session
 * version. `sv` is the row's `sessionVersion`, so the session survives the
 * re-check until something ends the user's sessions (P4.7).
 *
 * `accessLevel` is the claim the jwt callback writes at sign-in, which
 * `proxy.ts` reads (P4.5). Seeded sessions leave it out, as a token issued
 * before P4.5 does, so the proxy decides nothing for them.
 */

/** Matches NextAuth's inferred cookie name: `__Secure-` only on https. */
export function sessionCookieName(baseURL: string): string {
  return baseURL.startsWith('https:') ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
}

/** The seeded row a session token is minted from. */
interface SessionUser {
  id: string;
  name: string | null;
  email: string | null;
  image: string | null;
  isAdmin: boolean;
  sessionVersion: number;
}

/** Extra claims a test's session carries. */
export interface SessionClaims {
  accessLevel?: 'full' | 'lapsed' | 'none';
}

/** The NextAuth session JWT for `user`, as the session cookie carries it. */
export function mintSessionToken(user: SessionUser, secret: string, claims: SessionClaims = {}): Promise<string> {
  return encode({
    secret,
    token: {
      ...claims,
      sub: user.id,
      name: user.name,
      email: user.email,
      picture: user.image,
      isAdmin: user.isAdmin,
      checkedAt: 0,
      // The seeded row's version, so the jwt callback's re-check keeps the session.
      sv: user.sessionVersion,
    },
  });
}

/** Adds a session cookie for the seeded user `userId` to `context`. */
export async function signInAs(
  context: BrowserContext,
  baseURL: string,
  userId: string,
  claims: SessionClaims = {}
): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET must be set to mint an E2E session cookie.');
  }

  const prisma = createE2EPrismaClient();
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, image: true, isAdmin: true, sessionVersion: true },
    });
    const value = await mintSessionToken(user, secret, claims);
    await context.addCookies([
      { name: sessionCookieName(baseURL), value, url: baseURL, httpOnly: true, sameSite: 'Lax' },
    ]);
  } finally {
    await prisma.$disconnect();
  }
}

type SessionFixtures = {
  /** Signs the test's `context` (and so its `page`) in as a seeded user. */
  signIn: (userId: string) => Promise<void>;
};

export const test = base.extend<SessionFixtures>({
  signIn: async ({ context, baseURL }, use) => {
    if (!baseURL) {
      throw new Error('signIn needs `use.baseURL` in playwright.config.ts.');
    }
    await use((userId) => signInAs(context, baseURL, userId));
  },
});

export { expect } from '@playwright/test';
