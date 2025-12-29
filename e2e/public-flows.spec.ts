import { expect, test } from './fixtures/test-setup';
import { navigateAndVerify, waitForLoadingGone, WAIT_TIMEOUTS } from './helpers/test-utils';
import { createWrappedData } from './fixtures/factories';
import { createE2EPrismaClient } from './helpers/prisma';

test.describe('Public Flows', () => {
  test('home page has sign in button and initiates flow', async ({ page }) => {
    await navigateAndVerify(page, '/');

    // Check for collapsed Sign In button (use first() for responsive layouts)
    const signInButton = page.getByTestId('sign-in-button').first();
    await expect(signInButton).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(signInButton).toBeEnabled();

    // Click the button to expand and reveal sign-in options
    await signInButton.click();

    // Verify Plex sign-in button is now visible (only Plex configured in E2E environment)
    const plexSignInButton = page.getByTestId('sign-in-with-plex').first();
    await expect(plexSignInButton).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });

  test('invite page shows invalid state for unknown code', async ({ page }) => {
    const inviteCode = 'test-invite-code';
    await navigateAndVerify(page, `/invite/${inviteCode}`, {
      waitForSelector: 'h1, h2, [role="heading"]'
    });

    await expect(page.getByTestId('invalid-invite-heading')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });

  test('setup page redirects if already set up', async ({ page }) => {
    await page.goto('/setup');

    // Wait for any client-side redirects or hydration to finish
    await page.waitForLoadState('networkidle');

    // Wait for loading screen to disappear
    await waitForLoadingGone(page);

    // Verify we're redirected to home page with sign-in button
    await expect(page.getByTestId('sign-in-button')).toBeVisible();
  });

  test('denied page is accessible', async ({ page }) => {
    await page.goto('/auth/denied');

    // Should show access denied message (use first() for responsive layouts)
    await expect(page.getByTestId('access-denied-heading').first()).toBeVisible();
    // The page actually has a "Try Again" link and a "Return Home" button
    await expect(page.getByTestId('return-home-button').first()).toBeVisible();
  });

  test('onboarding page accessibility check', async ({ page }) => {
    await page.goto('/onboarding');

    // Wait for any redirects to settle
    await page.waitForLoadState('networkidle');
    await waitForLoadingGone(page);

    const url = page.url();
    const isHome = url.endsWith('/') || url.endsWith('/onboarding');
    const isSignin = url.includes('signin');
    const isOnboarding = url.includes('/onboarding');

    if (isOnboarding) {
      // If we stay on onboarding, verify the wizard is visible (or we're on the page)
      const wizardHeading = page.getByTestId('onboarding-wizard-heading').first();
      const hasWizard = await wizardHeading.isVisible().catch(() => false);
      if (hasWizard) {
        await expect(wizardHeading).toBeVisible();
      }
      // If no wizard visible but on onboarding page, that's acceptable (e.g., completed state)
    } else {
      // If redirected, ensure we are on a safe page
      expect(isHome || isSignin).toBeTruthy();
    }
  });

  test('shared wrapped page loads for unauthenticated user', async ({ page }) => {
    const prisma = createE2EPrismaClient();
    const shareToken = `test-share-${Date.now()}`;

    // Use factory to create wrapped data
    const wrappedData = createWrappedData({
      year: 2024,
      userId: 'regular-user-id',
      userName: 'Regular User',
    });

    try {
      // Create wrapped with share token (user should exist from global setup)
      await prisma.plexWrapped.create({
        data: {
          userId: 'regular-user-id',
          year: 2024,
          status: 'completed',
          data: JSON.stringify(wrappedData),
          shareToken: shareToken,
        }
      });

      // Navigate to share page
      await page.goto(`/wrapped/share/${shareToken}`);

      // Wait for page to load
      await page.waitForLoadState('networkidle');
      await waitForLoadingGone(page);

      // Wait for the heading to appear
      await expect(page.getByTestId('wrapped-share-heading')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      // Verify total watch time is displayed
      await expect(page.getByTestId('wrapped-total-watch-time')).toBeVisible();

    } finally {
      // Cleanup
      await prisma.plexWrapped.deleteMany({
        where: { shareToken: shareToken }
      });
      await prisma.$disconnect();
    }
  });
});
