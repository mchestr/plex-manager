import { expect, test } from '@playwright/test';
import { createE2EPrismaClient } from './helpers/prisma';
import { navigateAndVerify, waitForLoadingGone, WAIT_TIMEOUTS } from './helpers/test-utils';

test.describe('Public Flows', () => {
  test('home page has sign in button and initiates flow', async ({ page }) => {
    await navigateAndVerify(page, '/');

    // Check for collapsed Sign In button
    const signInButton = page.getByTestId('sign-in-button');
    await expect(signInButton).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(signInButton).toBeEnabled();

    // Click the button to expand and reveal sign-in options
    await signInButton.click();

    // Verify Plex toggle is now visible
    const plexToggle = page.getByTestId('toggle-plex');
    await expect(plexToggle).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
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

    await expect(page.getByTestId('sign-in-with-plex')).toBeVisible();
  });

  test('denied page is accessible', async ({ page }) => {
    await page.goto('/auth/denied');

    // Should show access denied message
    await expect(page.getByTestId('access-denied-heading')).toBeVisible();
    // The page actually has a "Try Again" link and a "Return Home" button, not a "Return to Home" link
    await expect(page.getByTestId('return-home-button')).toBeVisible();
  });

  test('onboarding page accessibility check', async ({ page }) => {

    await page.goto('/onboarding');

    const isHome = page.url().endsWith('/');
    const isSignin = page.url().includes('signin');
    const isOnboarding = page.url().includes('/onboarding');

    if (isOnboarding) {
      // If we stay on onboarding, verify the wizard is visible
      await expect(page.getByTestId('onboarding-wizard-heading')).toBeVisible();
      await expect(page.getByTestId('onboarding-wizard-subheading')).toBeVisible();
    } else {
      // If redirected, ensure we are on a safe page
      expect(isHome || isSignin).toBeTruthy();
    }
  });

  test('shared wrapped page loads for unauthenticated user', async ({ page }) => {
    const prisma = createE2EPrismaClient();
    const shareToken = `test-share-${Date.now()}`;

    // Mock wrapped data
    const mockWrappedData = {
      year: 2024,
      userId: 'regular-user-id',
      userName: 'Regular User',
      generatedAt: new Date().toISOString(),
      statistics: {
        totalWatchTime: { total: 1000, movies: 600, shows: 400 },
        moviesWatched: 10,
        showsWatched: 5,
        episodesWatched: 20,
        topMovies: [{ title: 'Test Movie', watchTime: 120, playCount: 1 }],
        topShows: [{ title: 'Test Show', watchTime: 200, playCount: 2, episodesWatched: 4 }]
      },
      sections: [
        {
          id: 'hero',
          type: 'hero',
          title: 'Your 2024 Wrapped',
          content: 'Welcome to your wrapped!',
          data: { prominentStat: { value: '1000', label: 'Minutes', description: 'Total Watch Time' } }
        }
      ],
      insights: {
        personality: 'Movie Buff',
        topGenre: 'Action',
        bingeWatcher: false,
        discoveryScore: 80,
        funFacts: ['You watched a lot!']
      },
      metadata: {
        totalSections: 1,
        generationTime: 5
      }
    };

    try {
      // Ensure regular user exists (should be created by global setup, but verify)
      const user = await prisma.user.findUnique({
        where: { id: 'regular-user-id' }
      });

      if (!user) {
        await prisma.user.create({
          data: {
            id: 'regular-user-id',
            plexUserId: 'regular-plex-id',
            name: 'Regular User',
            email: 'regular@example.com',
            isAdmin: false,
            primaryAuthService: 'plex',
            onboardingStatus: { plex: true, jellyfin: false },
          },
        });
      }

      // Create wrapped with share token
      await prisma.plexWrapped.create({
        data: {
          userId: 'regular-user-id',
          year: 2024,
          status: 'completed',
          data: JSON.stringify(mockWrappedData),
          shareToken: shareToken,
        }
      });

      // Verify the wrapped exists in the database before navigating
      // This ensures the transaction is committed and visible to the API route
      const createdWrapped = await prisma.plexWrapped.findUnique({
        where: { shareToken: shareToken },
      });

      if (!createdWrapped) {
        throw new Error('Failed to create wrapped in database');
      }

      // Navigate to share page
      await page.goto(`/wrapped/share/${shareToken}`);

      // Wait for page to load and any network requests to complete
      await page.waitForLoadState('networkidle');
      await waitForLoadingGone(page);

      // Wait for the heading to appear (the page uses client-side rendering with animations)
      await expect(page.getByTestId('wrapped-share-heading')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      // Verify total watch time is displayed (uses data-testid for stability)
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
