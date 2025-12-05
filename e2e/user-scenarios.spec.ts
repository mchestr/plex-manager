import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import {
  verifyNoAdminAccess,
  waitForLoadingGone,
  WAIT_TIMEOUTS
} from './helpers/test-utils';

test.describe('User Scenarios', () => {
  test.describe('Authentication & Authorization', () => {
    test('both user types can authenticate successfully', async ({ adminPage, regularUserPage }) => {
      // Admin page should be on home after auth
      await adminPage.goto('/');
      await expect(adminPage).toHaveURL(/\/$/);

      // Regular user page should also be on home after auth
      await regularUserPage.goto('/');
      await expect(regularUserPage).toHaveURL(/\/$/);
    });
  });

  test.describe('Session Persistence', () => {

    test('regular user session persists across navigation', async ({ regularUserPage }) => {
      // Navigate to home
      await regularUserPage.goto('/');

      // Navigate to wrapped
      await regularUserPage.goto('/wrapped');

      // Navigate back to home - should still be authenticated
      await regularUserPage.goto('/');

      // Still should not have admin access
      await verifyNoAdminAccess(regularUserPage);
    });
  });

  test.describe('Regular User Wrapped Experience', () => {
    test('regular user can access their wrapped content', async ({ regularUserPage }) => {
      const prisma = createE2EPrismaClient();
      const currentYear = new Date().getFullYear();

      // Mock wrapped data matching the WrappedData type structure
      const mockWrappedData = {
        year: currentYear,
        userId: TEST_USERS.REGULAR.id,
        userName: TEST_USERS.REGULAR.name,
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
            title: `Your ${currentYear} Wrapped`,
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
        // Create or update mock wrapped data for the regular user
        // Using upsert to handle existing records (ensures test isolation)
        await prisma.plexWrapped.upsert({
          where: {
            userId_year: {
              userId: TEST_USERS.REGULAR.id,
              year: currentYear,
            },
          },
          create: {
            userId: TEST_USERS.REGULAR.id,
            year: currentYear,
            status: 'completed',
            data: JSON.stringify(mockWrappedData),
            generatedAt: new Date(),
          },
          update: {
            status: 'completed',
            data: JSON.stringify(mockWrappedData),
            generatedAt: new Date(),
          },
        });

        // Navigate to wrapped page
        await regularUserPage.goto('/wrapped');
        await regularUserPage.waitForLoadState('networkidle');
        await waitForLoadingGone(regularUserPage);

        // Verify no 401 error
        const unauthorizedError = regularUserPage.getByText('401', { exact: true });
        await expect(unauthorizedError).not.toBeVisible();

        // Verify wrapped content is actually displayed (not "No Wrapped Found")
        const noWrappedFound = regularUserPage.getByTestId('no-wrapped-found');
        await expect(noWrappedFound).not.toBeVisible();

        // Verify some wrapped content is visible (check for year in heading or content)
        const wrappedContent = regularUserPage.getByText(new RegExp(`${currentYear}`, 'i'));
        await expect(wrappedContent).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      } finally {
        // Cleanup: delete the mock wrapped data
        await prisma.plexWrapped.deleteMany({
          where: {
            userId: TEST_USERS.REGULAR.id,
            year: currentYear,
          }
        });
        await prisma.$disconnect();
      }
    });

    test('anonymous user can access shared wrapped via share link', async ({ browser }) => {
      const prisma = createE2EPrismaClient();
      const currentYear = new Date().getFullYear();
      const shareToken = `test-share-${Date.now()}-${Math.random().toString(36).substring(7)}`;

      // Mock wrapped data matching the WrappedData type structure
      const mockWrappedData = {
        year: currentYear,
        userId: TEST_USERS.REGULAR.id,
        userName: TEST_USERS.REGULAR.name,
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
            title: `Your ${currentYear} Wrapped`,
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

      // Create an anonymous (unauthenticated) page context
      const context = await browser.newContext();
      const anonymousPage = await context.newPage();

      try {
        // Create or update mock wrapped data with shareToken for the regular user
        // Using upsert to handle existing records (ensures test isolation)
        await prisma.plexWrapped.upsert({
          where: {
            userId_year: {
              userId: TEST_USERS.REGULAR.id,
              year: currentYear,
            },
          },
          create: {
            userId: TEST_USERS.REGULAR.id,
            year: currentYear,
            status: 'completed',
            data: JSON.stringify(mockWrappedData),
            shareToken: shareToken,
            summary: `Check out ${TEST_USERS.REGULAR.name}'s ${currentYear} Plex Wrapped!`,
            generatedAt: new Date(),
          },
          update: {
            status: 'completed',
            data: JSON.stringify(mockWrappedData),
            shareToken: shareToken,
            summary: `Check out ${TEST_USERS.REGULAR.name}'s ${currentYear} Plex Wrapped!`,
            generatedAt: new Date(),
          },
        });

        // Navigate to share page as anonymous user
        await anonymousPage.goto(`/wrapped/share/${shareToken}`);
        await anonymousPage.waitForLoadState('networkidle');
        await waitForLoadingGone(anonymousPage);

        // Verify no 401 or 404 errors
        const unauthorizedError = anonymousPage.getByText('401', { exact: true });
        await expect(unauthorizedError).not.toBeVisible();

        const notFoundError = anonymousPage.getByText('404', { exact: true });
        await expect(notFoundError).not.toBeVisible();

        // Verify shared wrapped content is displayed using stable data-testid selectors
        const wrappedHeading = anonymousPage.getByTestId('wrapped-share-heading');
        await expect(wrappedHeading).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Verify statistics are visible using data-testid selectors
        const totalWatchTime = anonymousPage.getByTestId('wrapped-total-watch-time');
        await expect(totalWatchTime).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Verify "Total Watch Time" label is visible
        const totalWatchTimeLabel = anonymousPage.getByTestId('wrapped-total-watch-time-label');
        await expect(totalWatchTimeLabel).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Verify "Movies Watched" label is visible
        const moviesWatchedLabel = anonymousPage.getByTestId('wrapped-movies-watched-label');
        await expect(moviesWatchedLabel).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Verify "Shows Watched" label is visible
        const showsWatchedLabel = anonymousPage.getByTestId('wrapped-shows-watched-label');
        await expect(showsWatchedLabel).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Verify we're on the share page URL
        expect(anonymousPage.url()).toContain(`/wrapped/share/${shareToken}`);

      } finally {
        // Cleanup: delete the mock wrapped data
        await prisma.plexWrapped.deleteMany({
          where: { shareToken: shareToken }
        });
        await prisma.$disconnect();
        await context.close();
      }
    });
  });
});

