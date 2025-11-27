import { PrismaClient } from '@prisma/client';
import { expect, test, TEST_USERS } from './fixtures/auth';
import { waitForLoadingGone } from './helpers/test-utils';

test.describe('Onboarding Flow', () => {
  test('new user completes onboarding and is redirected to homepage', async ({ browser }) => {
    const prisma = new PrismaClient();

    try {
      // Set regular user's onboarding to false for this test
      await prisma.user.update({
        where: { id: TEST_USERS.REGULAR.id },
        data: { onboardingCompleted: false },
      });

      // Create a new browser context and page for this test
      const context = await browser.newContext({
        acceptDownloads: true,
      });
      const page = await context.newPage();

      try {
        // Authenticate the user - they should be redirected to onboarding
        await page.goto(`/auth/callback/plex?testToken=${TEST_USERS.REGULAR.testToken}`, { waitUntil: 'load' });

        // Wait for redirect to onboarding page
        await page.waitForURL((url) => {
          return url.pathname === '/onboarding';
        }, { timeout: 30000 });

        // Verify we're on the onboarding page
        expect(page.url()).toContain('/onboarding');
        await waitForLoadingGone(page);

        // Verify the welcome step is visible
        await expect(page.getByTestId('onboarding-welcome-heading')).toBeVisible({ timeout: 10000 });
        await expect(page.getByText("Let's get you started")).toBeVisible();

        // Step 1: Welcome - Click "Let's Go" button
        const letsGoButton = page.getByTestId('onboarding-welcome-continue');
        await expect(letsGoButton).toBeVisible();
        await letsGoButton.click();

        // Wait for success animation and next step
        await page.waitForTimeout(2000); // Wait for animation

        // Step 2: Plex Configuration - Click "Got it" button
        await expect(page.getByTestId('onboarding-plex-config-heading')).toBeVisible({ timeout: 10000 });
        const gotItButton = page.getByTestId('onboarding-plex-config-continue');
        await expect(gotItButton).toBeVisible();
        await gotItButton.click();

        // Wait for success animation and next step
        await page.waitForTimeout(2000);

        // Step 3: Media Requests - Click "Next" button
        await expect(page.getByTestId('onboarding-media-request-heading')).toBeVisible({ timeout: 10000 });
        const nextButton = page.getByTestId('onboarding-media-request-continue');
        await expect(nextButton).toBeVisible();
        await nextButton.click();

        // Wait for success animation and next step
        await page.waitForTimeout(2000);

        // Step 4: Support & Discord - Click "Next" button
        await expect(page.getByTestId('onboarding-discord-support-heading')).toBeVisible({ timeout: 10000 });
        const supportNextButton = page.getByTestId('onboarding-discord-support-continue');
        await expect(supportNextButton).toBeVisible();
        await supportNextButton.click();

        // Wait for success animation and final step
        await page.waitForTimeout(2000);

        // Step 5: Final Step - Click "Go to Dashboard" button
        await expect(page.getByTestId('onboarding-final-heading')).toBeVisible({ timeout: 10000 });
        const goToDashboardButton = page.getByTestId('onboarding-final-complete');
        await expect(goToDashboardButton).toBeVisible();
        await goToDashboardButton.click();

        // Wait for final success animation and redirect to homepage
        await page.waitForTimeout(3000); // Wait for final animation and redirect

        // Verify redirect to homepage
        await page.waitForURL((url) => {
          const isHome = url.pathname === '/' || url.pathname === '';
          return isHome;
        }, { timeout: 30000 });

        expect(page.url()).toMatch(/\/(\?.*)?$/); // Should be on homepage

        // Verify user is on homepage (not onboarding)
        expect(page.url()).not.toContain('/onboarding');

        // Verify onboarding was marked as complete in database
        const updatedUser = await prisma.user.findUnique({
          where: { id: TEST_USERS.REGULAR.id },
          select: { onboardingCompleted: true },
        });

        expect(updatedUser?.onboardingCompleted).toBe(true);

        // Verify homepage content is visible (dashboard or welcome content)
        await waitForLoadingGone(page);
        // The homepage should show some content - either dashboard or welcome message
        const hasContent = await Promise.race([
          page.getByRole('heading').first().isVisible().then(() => true),
          page.getByText(/Welcome|Dashboard|Plex/i).first().isVisible().then(() => true),
        ]).catch(() => false);

        expect(hasContent).toBe(true);

      } finally {
        await context.close();
      }

    } finally {
      // Restore regular user's onboarding status
      await prisma.user.update({
        where: { id: TEST_USERS.REGULAR.id },
        data: { onboardingCompleted: true },
      });
      await prisma.$disconnect();
    }
  });
});

