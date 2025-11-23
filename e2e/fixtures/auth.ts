import { test as base, expect as baseExpect, Page } from '@playwright/test';

/**
 * Test user types for different authentication scenarios
 */
export interface TestUser {
  id: string;
  email: string;
  name: string;
  plexUserId: string;
  isAdmin: boolean;
  onboardingCompleted: boolean;
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
    onboardingCompleted: true,
    testToken: 'TEST_ADMIN_TOKEN',
  },
  REGULAR: {
    id: 'regular-user-id',
    email: 'regular@example.com',
    name: 'Regular User',
    plexUserId: 'regular-plex-id',
    isAdmin: false,
    onboardingCompleted: true,
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

/**
 * Authenticate a page by navigating to the callback URL with a test token
 * This simulates a successful OAuth callback in test mode
 */
async function authenticateAs(page: Page, testToken: string): Promise<void> {
  console.log(`[E2E Auth] Authenticating with token: ${testToken}`);

  // Listen to console messages for debugging
  page.on('console', msg => {
    if (msg.text().includes('[AUTH]')) {
      console.log(`[Browser Console] ${msg.text()}`);
    }
  });

  // Navigate to the callback URL with the test token
  await page.goto(`/auth/callback/plex?testToken=${testToken}`, { waitUntil: 'load' });
  console.log(`[E2E Auth] Callback page loaded`);

  // Wait for the redirect to home - be more flexible with URL matching
  try {
    await page.waitForURL((url) => {
      const isHome = url.pathname === '/' || url.pathname === '';
      console.log(`[E2E Auth] Checking URL: ${url.pathname}, isHome: ${isHome}`);
      return isHome;
    }, { timeout: 30000 });
    console.log(`[E2E Auth] Redirected to: ${page.url()}`);
  } catch (error) {
    console.error(`[E2E Auth] Failed to redirect to home. Current URL: ${page.url()}`);
    // Take a screenshot for debugging
    await page.screenshot({ path: 'test-results/auth-redirect-failure.png' });
    throw error;
  }

  // Wait for the page to be fully loaded after the redirect
  await page.waitForLoadState('domcontentloaded', { timeout: 10000 });

  // Verify session was created by checking the session API
  const sessionResponse = await page.request.get('/api/auth/session');
  const session = await sessionResponse.json();

  console.log(`[E2E Auth] Session: ${JSON.stringify(session)}`);

  if (!session || !session.user) {
    // Get cookies for debugging
    const cookies = await page.context().cookies();
    const authCookies = cookies.filter(c => c.name.includes('next-auth'));

    throw new Error(
      `Failed to create session for test token: ${testToken}.\n` +
      `Session: ${JSON.stringify(session)}\n` +
      `Auth cookies: ${JSON.stringify(authCookies.map(c => c.name))}`
    );
  }

  console.log(`[E2E Auth] Successfully authenticated as: ${session.user.email} (isAdmin: ${session.user.isAdmin})`);
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

    await authenticateAs(page, TEST_USERS.ADMIN.testToken);

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

    await authenticateAs(page, TEST_USERS.ADMIN.testToken);
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

    await authenticateAs(page, TEST_USERS.REGULAR.testToken);
    await verifyAuthentication(page, false);

    await use(page);

    await context.close();
  },
});

export { baseExpect as expect };

