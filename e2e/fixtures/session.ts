import { test as base, type BrowserContext } from '@playwright/test';
import { encode } from 'next-auth/jwt';
import { createE2EPrismaClient } from '../helpers/prisma';

/**
 * Signs a browser context in by minting the NextAuth session cookie directly,
 * instead of going through the Plex callback page. Works against `next dev`
 * and a production build alike, and needs no application code.
 *
 * The token carries `checkedAt: 0`, so the first request's jwt callback
 * treats it as stale and re-reads the seeded row's admin flag.
 */

/** Matches NextAuth's inferred cookie name: `__Secure-` only on https. */
export function sessionCookieName(baseURL: string): string {
  return baseURL.startsWith('https:') ? '__Secure-next-auth.session-token' : 'next-auth.session-token';
}

/** Adds a session cookie for the seeded user `userId` to `context`. */
export async function signInAs(context: BrowserContext, baseURL: string, userId: string): Promise<void> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) {
    throw new Error('NEXTAUTH_SECRET must be set to mint an E2E session cookie.');
  }

  const prisma = createE2EPrismaClient();
  try {
    const user = await prisma.user.findUniqueOrThrow({
      where: { id: userId },
      select: { id: true, name: true, email: true, image: true, isAdmin: true },
    });
    const value = await encode({
      secret,
      token: {
        sub: user.id,
        name: user.name,
        email: user.email,
        picture: user.image,
        isAdmin: user.isAdmin,
        checkedAt: 0,
      },
    });
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
