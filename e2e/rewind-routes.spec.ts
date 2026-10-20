import { randomBytes } from 'node:crypto';

import { expect, test, TEST_USERS } from './fixtures/auth';
import { signInAs } from './fixtures/session';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * P5.1 (FR-1, RWP-04, RWV-02, UI-02, UI-39): Rewind lives at `/rewind` and
 * `/rewind/<year>`, the year comes from data, and old `/wrapped` links,
 * share links included, answer with permanent redirects.
 *
 * `page.clock` moves only the browser clock to 2027-01-02. The server's clock
 * is real: from October 2026 to January 2027 the season is 2026, and later
 * the 2027 season has no row, so `/rewind` opens the latest completed year,
 * 2026, either way. The Jest tests cover the server's January rule.
 */

const SEEDED_YEARS = [2025, 2026];
const TOUCHED_YEARS = [...SEEDED_YEARS, 2027];
const SERVER_NAME = 'Chester Family Plex';
const SHARE_TOKEN = randomBytes(32).toString('base64url');
const SEEDED_CONFIG = { rewindSeasonOpens: '12-01', rewindSeasonCloses: '01-31', serverName: SERVER_NAME };
const CONFIG_SELECT = { rewindSeasonOpens: true, rewindSeasonCloses: true, serverName: true } as const;
type SeededConfig = { rewindSeasonOpens: string; rewindSeasonCloses: string; serverName: string | null };

function rewindData(year: number) {
  return {
    version: 2,
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
    sections: [],
    insights: { personality: 'Movie Buff', topGenre: 'Action', bingeWatcher: false, discoveryScore: 80, funFacts: [] },
    metadata: { totalSections: 0, generationTime: 5 },
  };
}

test.describe('Rewind routes', () => {
  let previous: SeededConfig | null = null;

  test.beforeAll(async ({ browser }, testInfo) => {
    test.setTimeout(150_000);
    const prisma = createE2EPrismaClient();
    try {
      previous = await prisma.config.findUnique({ where: { id: 'config' }, select: CONFIG_SELECT });
      await prisma.config.upsert({ where: { id: 'config' }, create: { id: 'config', ...SEEDED_CONFIG }, update: SEEDED_CONFIG });

      await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.REGULAR.id, year: { in: TOUCHED_YEARS } } });
      for (const year of SEEDED_YEARS) {
        await prisma.plexWrapped.create({
          data: {
            userId: TEST_USERS.REGULAR.id,
            year,
            status: 'completed',
            data: JSON.stringify(rewindData(year)),
            generatedAt: new Date(`${year}-12-05T12:00:00Z`),
            ...(year === 2025 && { shareToken: SHARE_TOKEN }),
          },
        });
      }
    } finally {
      await prisma.$disconnect();
    }

    // The app reads the server name through a 60-second data cache
    // (lib/settings/app-settings.ts) that only the app's own settings writes
    // clear, so a name an earlier spec's seed left can outlive the Config row
    // above for up to a minute. Ask for the page's HTML until the cache serves
    // the seeded name, here and not in the test: the test's page runs on a
    // fixed clock, and a minute of waiting there stalls the viewer's intro.
    const baseURL = testInfo.project.use.baseURL!;
    const context = await browser.newContext({ baseURL });
    try {
      await signInAs(context, baseURL, TEST_USERS.REGULAR.id);
      await expect
        .poll(
          async () => {
            const html = await (await context.request.get('/rewind/2026')).text();
            return /<title>([^<]*)<\/title>/.exec(html)?.[1];
          },
          { intervals: [1_000, 2_000, 5_000], timeout: 120_000 }
        )
        .toBe(`${SERVER_NAME} Rewind 2026`);
    } finally {
      await context.close();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.REGULAR.id, year: { in: TOUCHED_YEARS } } });
      if (previous) {
        await prisma.config.update({ where: { id: 'config' }, data: previous });
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

  test('/rewind opens the latest completed year, titled with the server name', async ({ regularUserPage }) => {
    await regularUserPage.goto('/rewind');

    await expect(regularUserPage).toHaveURL(/\/rewind\/2026$/);
    await expect(regularUserPage).toHaveTitle(`${SERVER_NAME} Rewind 2026`);
    // The v2 viewer shows after its intro transition
    await expect(regularUserPage.getByTestId('wrapped-viewer')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(regularUserPage.getByTestId('rewind-scope')).toHaveAttribute('data-theme', 'rewind');
    await expect(regularUserPage.getByTestId('wrapped-year-link-2025')).toHaveAttribute('href', '/rewind/2025');
  });

  test('/rewind/2025 opens the past year', async ({ regularUserPage }) => {
    await regularUserPage.goto('/rewind/2025');

    await expect(regularUserPage.getByTestId('wrapped-viewer')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(regularUserPage.getByTestId('wrapped-year-link-2025')).toHaveAttribute('aria-current', 'page');
  });

  test('/rewind/1999 is a 404 that links to the member\'s years', async ({ regularUserPage }) => {
    const response = await regularUserPage.goto('/rewind/1999');

    expect(response?.status()).toBe(404);
    await expect(regularUserPage.getByTestId('rewind-year-links')).toBeVisible();
    await expect(regularUserPage.getByTestId('rewind-year-link-2026')).toHaveAttribute('href', '/rewind/2026');
  });

  test('old /wrapped links answer with a permanent redirect, keeping the query', async ({ request }) => {
    const cases = [
      ['/wrapped', '/rewind'],
      ['/wrapped/2025?from=%2Fdiscord%2Flink', '/rewind/2025?from=%2Fdiscord%2Flink'],
      [`/wrapped/share/${SHARE_TOKEN}`, `/rewind/s/${SHARE_TOKEN}`],
      [`/wrapped/share/${SHARE_TOKEN}?ref=x`, `/rewind/s/${SHARE_TOKEN}?ref=x`],
    ];
    for (const [from, to] of cases) {
      const response = await request.get(from, { maxRedirects: 0 });
      expect(response.status(), from).toBe(308);
      const location = new URL(response.headers()['location'], 'http://localhost');
      expect(location.pathname + location.search, from).toBe(to);
    }
  });

  test('a followed share redirect still renders the shared page', async ({ page }) => {
    await page.goto(`/wrapped/share/${SHARE_TOKEN}`);

    await expect(page).toHaveURL(new RegExp(`/rewind/s/${SHARE_TOKEN}$`));
    await expect(page.getByTestId('wrapped-share-summary')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });

  test('Close returns to ?from=, or home', async ({ regularUserPage }) => {
    await regularUserPage.goto('/rewind/2019?from=/discord/link');
    await expect(regularUserPage.getByTestId('rewind-status-panel')).toHaveAttribute('data-kind', 'not-found');
    await regularUserPage.getByTestId('rewind-close').click();
    await expect(regularUserPage).toHaveURL(/\/discord\/link$/);

    await regularUserPage.goto('/rewind/2019?from=//evil.example');
    await regularUserPage.getByTestId('rewind-close').click();
    await expect(regularUserPage).toHaveURL(/localhost:\d+\/$/);
  });
});
