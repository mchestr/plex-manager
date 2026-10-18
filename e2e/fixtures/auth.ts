import { test as base, expect as baseExpect, Page } from '@playwright/test';
import { createE2EPrismaClient } from '../helpers/prisma';

/**
 * Test user types for different authentication scenarios
 */
export interface TestUser {
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
    testToken: 'TEST_ADMIN_TOKEN',
  },
  REGULAR: {
    id: 'regular-user-id',
    email: 'regular@example.com',
    name: 'Regular User',
    plexUserId: 'regular-plex-id',
    isAdmin: false,
    primaryAuthService: 'plex',
    onboardingStatus: { plex: true, jellyfin: false },
    testToken: 'TEST_REGULAR_TOKEN',
  },
} as const;

/**
 * Custom test type with authenticated page contexts
 */
type AuthFixtures = {
  authenticatedPage: Page;
  adminPage: Page;
  regularUserPage: Page;
};

/** Sign-in attempts through the callback page before the fixture gives up. */
const SIGN_IN_ATTEMPTS = 2;

/** What `/api/auth/session` returns: `{}` without a session. */
interface SessionResponse {
  user?: { email?: string | null; isAdmin?: boolean };
}

/**
 * Authenticate a page by navigating to the callback URL with a test token
 * This simulates a successful OAuth callback in test mode
 */
async function authenticateAs(page: Page, testToken: string, expectedUser?: TestUser): Promise<void> {
  console.log(`[E2E Auth] Authenticating with token: ${testToken}`);

  // Ensure user has completed onboarding before authentication
  if (expectedUser) {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.user.update({
        where: { id: expectedUser.id },
        data: {
          primaryAuthService: expectedUser.primaryAuthService,
          onboardingStatus: expectedUser.onboardingStatus,
        },
      });
      console.log(`[E2E Auth] Ensured onboarding is complete for user: ${expectedUser.email}`);
    } catch (err) {
      console.warn(`[E2E Auth] Could not update onboarding status:`, err);
    } finally {
      await prisma.$disconnect();
    }
  }

  // Listen to console messages for debugging
  page.on('console', msg => {
    if (msg.text().includes('[AUTH]')) {
      console.log(`[Browser Console] ${msg.text()}`);
    }
  });

  // next-auth mints a CSRF cookie for every /api/auth request that arrives
  // without one. On the callback page, SessionProvider's /api/auth/session and
  // signIn()'s /api/auth/csrf can be in flight together (under next dev the
  // first compile of the route makes that likely), so each mints its own
  // cookie. When the session response's cookie lands after the token signIn()
  // read, the POST fails the CSRF check, yet signIn() reports ok because
  // next-auth answers with a redirect URL that has no error. The page then
  // redirects without a session. Setting the cookie here first, which also
  // compiles the route, means no request on the page mints another.
  // page.request shares the context's cookies.
  await page.request.get('/api/auth/csrf');

  for (let attempt = 1; ; attempt++) {
    await signInThroughCallback(page, testToken);

    const session = await waitForSession(page);
    if (session?.user) {
      console.log(`[E2E Auth] Successfully authenticated as: ${session.user.email} (isAdmin: ${session.user.isAdmin})`);
      return;
    }

    if (attempt === SIGN_IN_ATTEMPTS) {
      // Get cookies for debugging
      const cookies = await page.context().cookies();
      const authCookies = cookies.filter(c => c.name.includes('next-auth'));

      throw new Error(
        `Failed to create session for test token: ${testToken}.\n` +
        `Session: ${JSON.stringify(session)}\n` +
        `Auth cookies: ${JSON.stringify(authCookies.map(c => c.name))}\n` +
        `Sign-in attempts: ${attempt}/${SIGN_IN_ATTEMPTS}`
      );
    }
    console.warn(`[E2E Auth] No session after sign-in attempt ${attempt}/${SIGN_IN_ATTEMPTS}, retrying`);
  }
}

/**
 * Opens the Plex callback page with the test token and waits for it to
 * redirect home or to onboarding, the page's signal that signIn() returned.
 */
async function signInThroughCallback(page: Page, testToken: string): Promise<void> {
  // Navigate to the callback URL with the test token
  await page.goto(`/auth/callback/plex?testToken=${testToken}`, { waitUntil: 'load' });
  console.log(`[E2E Auth] Callback page loaded`);

  // Wait for redirect to home - accept both home and onboarding as valid redirects
  // Users with incomplete onboarding will be redirected to /onboarding
  try {
    await page.waitForURL((url) => {
      const isHome = url.pathname === '/' || url.pathname === '';
      const isOnboarding = url.pathname === '/onboarding';
      const isValid = isHome || isOnboarding;
      console.log(`[E2E Auth] Checking URL: ${url.pathname}, isHome: ${isHome}, isOnboarding: ${isOnboarding}`);
      return isValid;
    }, { timeout: 30000 });
    console.log(`[E2E Auth] Redirected to: ${page.url()}`);

    // If redirected to onboarding, navigate to home (onboarding should already be complete)
    if (page.url().includes('/onboarding')) {
      console.log(`[E2E Auth] User redirected to onboarding, navigating to home...`);
      await page.goto('/');
      await page.waitForLoadState('networkidle');
      console.log(`[E2E Auth] Navigated to home: ${page.url()}`);
    }
  } catch (error) {
    const currentUrl = page.url();
    console.error(`[E2E Auth] Failed to redirect to expected page. Current URL: ${currentUrl}`);
    // Take a screenshot for debugging (only if page is still open)
    try {
      if (!page.isClosed()) {
        await page.screenshot({ path: 'test-results/auth-redirect-failure.png' });
      }
    } catch (screenshotError) {
      console.error(`[E2E Auth] Could not take screenshot:`, screenshotError);
    }
    throw error;
  }

  // Wait for the page to be fully loaded after the redirect
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 });
}

/**
 * Polls the session API until it returns a user, for at most 10 seconds,
 * and returns the last session it read.
 */
async function waitForSession(page: Page): Promise<SessionResponse | null> {
  let session: SessionResponse | null = null;
  const maxAttempts = 20; // 10 seconds max wait (20 attempts * 500ms)

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const sessionResponse = await page.request.get('/api/auth/session');
      session = (await sessionResponse.json()) as SessionResponse | null;

      if (session?.user) {
        console.log(`[E2E Auth] Session established on attempt ${attempt}: ${JSON.stringify(session)}`);
        return session;
      }
    } catch (err) {
      console.log(`[E2E Auth] Session check failed on attempt ${attempt}, retrying...`);
    }

    // Wait 500ms before next attempt
    await new Promise(resolve => setTimeout(resolve, 500));
  }

  return session;
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
  authenticatedPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      // Accept all cookies
      acceptDownloads: true,
    });
    const page = await context.newPage();

    await authenticateAs(page, TEST_USERS.ADMIN.testToken, TEST_USERS.ADMIN);

    await use(page);

    await context.close();
  },

  // Admin user page
  adminPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      // Accept all cookies
      acceptDownloads: true,
    });
    const page = await context.newPage();

    await authenticateAs(page, TEST_USERS.ADMIN.testToken, TEST_USERS.ADMIN);
    await verifyAuthentication(page, true);

    await use(page);

    await context.close();
  },

  // Regular user page
  regularUserPage: async ({ browser }, use) => {
    const context = await browser.newContext({
      // Accept all cookies
      acceptDownloads: true,
    });
    const page = await context.newPage();

    await authenticateAs(page, TEST_USERS.REGULAR.testToken, TEST_USERS.REGULAR);
    await verifyAuthentication(page, false);

    await use(page);

    await context.close();
  },
});

export { baseExpect as expect };

