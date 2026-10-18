import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * P0.14 (RWP-04, RWV-02, UI-02): the Rewind year comes from data, not the
 * calendar. With a Dec 1 window saved in 2026 and completed 2025 and 2026
 * Rewinds, `/wrapped` opens 2026 and past years open by URL.
 *
 * `page.clock` moves only the browser clock to 2027-01-02. The server picks
 * the year from the stored rows and the window, which is what this proves;
 * the Jest season tests cover the server's own January fallback.
 */

const SEEDED_YEARS = [2025, 2026];
const TOUCHED_YEARS = [...SEEDED_YEARS, 2027];
const WINDOW_START = new Date('2026-12-01T12:00:00Z');

function rewindData(year: number) {
  return {
    year,
    userId: TEST_USERS.REGULAR.id,
    userName: TEST_USERS.REGULAR.name,
    generatedAt: new Date(`${year}-12-05T12:00:00Z`).toISOString(),
    statistics: {
      totalWatchTime: { total: 1000, movies: 600, shows: 400 },
      moviesWatched: 10,
      showsWatched: 5,
      episodesWatched: 20,
      topMovies: [{ title: 'Test Movie', watchTime: 120, playCount: 1 }],
      topShows: [{ title: 'Test Show', watchTime: 200, playCount: 2, episodesWatched: 4 }],
    },
    sections: [
      {
        id: 'hero',
        type: 'hero',
        title: `Your ${year} Wrapped`,
        content: 'Welcome to your wrapped!',
        data: { prominentStat: { value: '1000', label: 'Minutes', description: 'Total Watch Time' } },
      },
    ],
    insights: {
      personality: 'Movie Buff',
      topGenre: 'Action',
      bingeWatcher: false,
      discoveryScore: 80,
      funFacts: ['You watched a lot!'],
    },
    metadata: { totalSections: 1, generationTime: 5 },
  };
}

test.describe('Rewind year from data', () => {
  let hadConfig = false;
  let previousStart: Date | null = null;

  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      const config = await prisma.config.findUnique({
        where: { id: 'config' },
        select: { wrappedGenerationStartDate: true },
      });
      hadConfig = config !== null;
      previousStart = config?.wrappedGenerationStartDate ?? null;
      await prisma.config.upsert({
        where: { id: 'config' },
        create: { id: 'config', wrappedGenerationStartDate: WINDOW_START },
        update: { wrappedGenerationStartDate: WINDOW_START },
      });

      await prisma.plexWrapped.deleteMany({
        where: { userId: TEST_USERS.REGULAR.id, year: { in: TOUCHED_YEARS } },
      });
      for (const year of SEEDED_YEARS) {
        await prisma.plexWrapped.create({
          data: {
            userId: TEST_USERS.REGULAR.id,
            year,
            status: 'completed',
            data: JSON.stringify(rewindData(year)),
            generatedAt: new Date(`${year}-12-05T12:00:00Z`),
          },
        });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.plexWrapped.deleteMany({
        where: { userId: TEST_USERS.REGULAR.id, year: { in: TOUCHED_YEARS } },
      });
      if (hadConfig) {
        await prisma.config.update({
          where: { id: 'config' },
          data: { wrappedGenerationStartDate: previousStart },
        });
      } else {
        await prisma.config.delete({ where: { id: 'config' } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test.beforeEach(async ({ regularUserPage }) => {
    await regularUserPage.clock.setFixedTime(new Date('2027-01-02T12:00:00Z'));
  });

  test('/wrapped opens the latest completed year on 2027-01-02', async ({ regularUserPage }) => {
    await regularUserPage.goto('/wrapped');

    await expect(regularUserPage).toHaveURL(/\/wrapped\/2026$/);
    // The viewer shows after its ~6.5 s intro transition
    await expect(regularUserPage.getByTestId('wrapped-viewer')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(regularUserPage.getByTestId('no-wrapped-found')).toHaveCount(0);
    await expect(regularUserPage.getByTestId('wrapped-year-link-2026')).toHaveAttribute('aria-current', 'page');
    await expect(regularUserPage.getByTestId('wrapped-year-link-2025')).toHaveAttribute('href', '/wrapped/2025');
  });

  test('/wrapped/2025 opens the past year', async ({ regularUserPage }) => {
    await regularUserPage.goto('/wrapped/2025');

    await expect(regularUserPage).toHaveURL(/\/wrapped\/2025$/);
    await expect(regularUserPage.getByTestId('wrapped-viewer')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(regularUserPage.getByTestId('wrapped-year-link-2025')).toHaveAttribute('aria-current', 'page');
  });

  test('a year without a Rewind says so and links to the latest one', async ({ regularUserPage }) => {
    await regularUserPage.goto('/wrapped/2019');

    await expect(regularUserPage.getByTestId('no-wrapped-found')).toBeVisible();
    await expect(regularUserPage.getByTestId('wrapped-year-missing')).toHaveText("You don't have a Rewind for 2019.");
    await expect(regularUserPage.getByTestId('wrapped-latest-year-link')).toHaveAttribute('href', '/wrapped/2026');
  });

  // The plan's /wrapped/1999 is outside the accepted 2010-2100 range, so it
  // is a 404; 2019 above covers an in-range year with no Rewind.
  for (const year of ['1999', 'abc']) {
    test(`/wrapped/${year} is not found`, async ({ regularUserPage }) => {
      await regularUserPage.goto(`/wrapped/${year}`);

      await expect(regularUserPage.getByTestId('wrapped-year-not-found')).toBeVisible();
      await expect(regularUserPage.getByTestId('no-wrapped-found')).toHaveCount(0);
      await expect(regularUserPage.getByTestId('wrapped-viewer')).toHaveCount(0);
    });
  }
});
