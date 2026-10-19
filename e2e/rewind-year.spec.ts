import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * P0.14 (RWP-04, RWV-02, UI-02): the Rewind year comes from data, not the
 * calendar. With the default 12-01 to 01-31 season (P2.2) and completed 2025
 * and 2026 Rewinds, `/wrapped` opens 2026 and past years open by URL.
 *
 * `page.clock` moves only the browser clock to 2027-01-02. The server's clock
 * is real: from October 2026 to January 2027 the season is 2026, and later
 * the 2027 season has no row, so `/wrapped` falls back to the latest
 * completed year, 2026, either way. The Jest season tests cover the dates.
 */

const SEEDED_YEARS = [2025, 2026];
const TOUCHED_YEARS = [...SEEDED_YEARS, 2027];
const DEFAULT_SEASON = { rewindSeasonOpens: '12-01', rewindSeasonCloses: '01-31' };
type Season = typeof DEFAULT_SEASON;
const SEASON_SELECT = { rewindSeasonOpens: true, rewindSeasonCloses: true } as const;

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
  let previousSeason: Season | null = null;

  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      previousSeason = await prisma.config.findUnique({ where: { id: 'config' }, select: SEASON_SELECT });
      hadConfig = previousSeason !== null;
      await prisma.config.upsert({
        where: { id: 'config' },
        create: { id: 'config', ...DEFAULT_SEASON },
        update: DEFAULT_SEASON,
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
      if (hadConfig && previousSeason) {
        await prisma.config.update({ where: { id: 'config' }, data: previousSeason });
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
  // is a 404; 2019 above covers an in-range year with no Rewind. The status
  // comes from proxy.ts, because app/loading.tsx streams every page.
  for (const year of ['1999', 'abc']) {
    test(`/wrapped/${year} is not found`, async ({ regularUserPage }) => {
      const response = await regularUserPage.goto(`/wrapped/${year}`);

      expect(response?.status()).toBe(404);
      await expect(regularUserPage.getByTestId('wrapped-year-not-found')).toBeVisible();
      await expect(regularUserPage.getByTestId('no-wrapped-found')).toHaveCount(0);
      await expect(regularUserPage.getByTestId('wrapped-viewer')).toHaveCount(0);
    });
  }
});

/**
 * From 2026 on, the season year is 2026 or later, so a member whose only
 * Rewind is 2025 tells the two rules apart: redirecting to the season year
 * would open /wrapped/2026, and the data rule opens 2025. The server clock is
 * real here.
 */
test.describe('Rewind year from data, with only an older Rewind', () => {
  let previousSeason: Season | null = null;

  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      previousSeason = await prisma.config.findUnique({ where: { id: 'config' }, select: SEASON_SELECT });
      if (previousSeason) {
        await prisma.config.update({ where: { id: 'config' }, data: DEFAULT_SEASON });
      }

      await prisma.plexWrapped.deleteMany({
        where: { userId: TEST_USERS.REGULAR.id, year: { in: TOUCHED_YEARS } },
      });
      await prisma.plexWrapped.create({
        data: {
          userId: TEST_USERS.REGULAR.id,
          year: 2025,
          status: 'completed',
          data: JSON.stringify(rewindData(2025)),
          generatedAt: new Date('2025-12-05T12:00:00Z'),
        },
      });
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
      if (previousSeason) {
        await prisma.config.update({ where: { id: 'config' }, data: previousSeason });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test('/wrapped opens the only completed year, not the season year', async ({ regularUserPage }) => {
    test.skip(new Date().getFullYear() <= 2025, 'the two rules agree until the calendar reaches 2026');

    await regularUserPage.goto('/wrapped');

    await expect(regularUserPage).toHaveURL(/\/wrapped\/2025$/);
    await expect(regularUserPage.getByTestId('wrapped-viewer')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(regularUserPage.getByTestId('wrapped-year-link-2025')).toHaveAttribute('aria-current', 'page');
  });
});
