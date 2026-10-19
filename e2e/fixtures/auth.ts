import { test as base, expect as baseExpect, type Browser, type Page } from '@playwright/test';
import { createE2EPrismaClient } from '../helpers/prisma';
import { signInAs } from './session';

/**
 * Test user types for different authentication scenarios
 */
interface TestUser {
  id: string;
  email: string;
  name: string;
  plexUserId: string;
  isAdmin: boolean;
  primaryAuthService: string;
  onboardingStatus: { plex: boolean; jellyfin: boolean };
}

/**
 * Pre-defined test users that match the seed data
 */
export const TEST_USERS = {
  ADMIN: {
    id: 'admin-user-id',
    email: 'admin@example.com',
    name: 'Admin User',
    plexUserId: 'admin-plex-id',
    isAdmin: true,
    primaryAuthService: 'plex',
    onboardingStatus: { plex: true, jellyfin: false },
  },
  REGULAR: {
    id: 'regular-user-id',
    email: 'regular@example.com',
    name: 'Regular User',
    plexUserId: 'regular-plex-id',
    isAdmin: false,
    primaryAuthService: 'plex',
    onboardingStatus: { plex: true, jellyfin: false },
  },
} as const satisfies Record<string, TestUser>;

/**
 * Custom test type with authenticated page contexts
 */
type AuthFixtures = {
  authenticatedPage: Page;
  adminPage: Page;
  regularUserPage: Page;
};

/** What `/api/auth/session` returns: `{}` without a session. */
interface SessionResponse {
  user?: { email?: string | null; isAdmin?: boolean };
}

/**
 * Opens a new context signed in as `user` through the minted session cookie
 * (`./session.ts`), after marking the user's onboarding complete. Works
 * against `next dev` and a production build alike.
 */
async function authenticatedContextPage(browser: Browser, baseURL: string | undefined, user: TestUser): Promise<Page> {
  if (!baseURL) {
    throw new Error('The auth fixtures need `use.baseURL` in playwright.config.ts.');
  }

  const prisma = createE2EPrismaClient();
  try {
    await prisma.user.update({
      where: { id: user.id },
      data: { primaryAuthService: user.primaryAuthService, onboardingStatus: user.onboardingStatus },
    });
  } finally {
    await prisma.$disconnect();
  }

  const context = await browser.newContext({ acceptDownloads: true });
  await signInAs(context, baseURL, user.id);
  const page = await context.newPage();

  const response = await page.request.get('/api/auth/session');
  const session = (await response.json()) as SessionResponse;
  if (session.user?.email !== user.email) {
    throw new Error(`The minted session for ${user.email} was not accepted: ${JSON.stringify(session)}`);
  }
  return page;
}

/**
 * Verify that a user is properly authenticated by checking for UI elements
 * that only appear when logged in
 */
async function verifyAuthentication(page: Page, isAdmin: boolean): Promise<void> {
  // Navigate to home to verify authentication state
  await page.goto('/');

  // Wait for page to load
  await page.waitForLoadState('networkidle');

  // If admin, we can verify access to admin pages
  if (isAdmin) {
    await page.goto('/admin');
    // /admin redirects to /admin/users. The admin layout streams, so the
    // redirect runs in the browser after `load`; a test's next goto would
    // otherwise race it and fail with net::ERR_ABORTED.
    await page.waitForURL('**/admin/users');
    await page.waitForLoadState('networkidle');
    // Should not see 401 error
    const unauthorizedError = page.getByText('401', { exact: true });
    await baseExpect(unauthorizedError).not.toBeVisible();
  }
}

/**
 * Extended test with authentication fixtures
 */
export const test = base.extend<AuthFixtures>({
  // Generic authenticated page (defaults to admin for backward compatibility)
  authenticatedPage: async ({ browser, baseURL }, use) => {
    const page = await authenticatedContextPage(browser, baseURL, TEST_USERS.ADMIN);
    await use(page);
    await page.context().close();
  },

  // Admin user page
  adminPage: async ({ browser, baseURL }, use) => {
    const page = await authenticatedContextPage(browser, baseURL, TEST_USERS.ADMIN);
    await verifyAuthentication(page, true);
    await use(page);
    await page.context().close();
  },

  // Regular user page
  regularUserPage: async ({ browser, baseURL }, use) => {
    const page = await authenticatedContextPage(browser, baseURL, TEST_USERS.REGULAR);
    await verifyAuthentication(page, false);
    await use(page);
    await page.context().close();
  },
});

export { baseExpect as expect };
