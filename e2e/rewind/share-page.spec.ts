import { createHash, randomBytes } from 'node:crypto';

import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearRateLimits } from '../helpers/rate-limits';
import { REWIND_YEAR, seedRewindIssue } from '../helpers/seed-rewind';
import { waitForLoadingGone, WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * P7.5: the public share page, extending P5.11's share sheet spec
 * (`share.spec.ts`). A v3 link that publishes only Top shows is written
 * straight to the database (its token is known here, only its SHA-256 is
 * stored), on the admin's heavy fixture:
 *
 * - a logged-out visitor sees only the published card, with `X-Robots-Tag`;
 * - the owner sees the banner, and after Rotate the old URL is a 404 at once;
 * - a revoked link is "This Rewind is no longer shared" with status 404, and
 *   an old `/wrapped/share/<v2 token>` lands on the v2 article here;
 * - axe at WCAG 2.2 AA finds nothing.
 *
 * `rewind-e2e-chromium`, `rewind-e2e-webkit` and `rewind-e2e-firefox` run it.
 */

const YEAR = REWIND_YEAR;
const V2_YEAR = 2024;
const ASSET_KEY_LENGTH = 22;

const sha256 = (value: string) => createHash('sha256').update(value).digest('hex');
const newToken = () => randomBytes(32).toString('base64url');

/** A live link on the admin's Rewind that publishes only `pages`; returns its token. */
async function createLink(pages: string[] = ['top-shows'], revoked = false): Promise<string> {
  const token = newToken();
  const prisma = createE2EPrismaClient();
  try {
    const wrapped = await prisma.plexWrapped.findUniqueOrThrow({
      where: { userId_year: { userId: TEST_USERS.ADMIN.id, year: YEAR } },
      select: { id: true },
    });
    await prisma.rewindShare.updateMany({ where: { wrappedId: wrapped.id, revokedAt: null }, data: { revokedAt: new Date() } });
    await prisma.rewindShare.create({
      data: {
        wrappedId: wrapped.id,
        tokenHash: sha256(token),
        assetKey: randomBytes(16).toString('base64url'),
        pages,
        cardFacts: [],
        revokedAt: revoked ? new Date() : null,
      },
    });
  } finally {
    await prisma.$disconnect();
  }
  return token;
}

async function seedV2Share(token: string) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.REGULAR.id, year: V2_YEAR } });
    await prisma.plexWrapped.create({
      data: {
        userId: TEST_USERS.REGULAR.id,
        year: V2_YEAR,
        status: 'completed',
        shareToken: token,
        data: JSON.stringify({
          year: V2_YEAR,
          statistics: {
            totalWatchTime: { total: 1000, movies: 600, shows: 400 },
            moviesWatched: 10,
            showsWatched: 5,
            episodesWatched: 20,
            topMovies: [{ title: 'Test Movie', watchTime: 120, playCount: 1 }],
            topShows: [{ title: 'Test Show', watchTime: 200, playCount: 2, episodesWatched: 4 }],
          },
        }),
      },
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanUp() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: YEAR } });
    await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.REGULAR.id, year: V2_YEAR } });
  } finally {
    await prisma.$disconnect();
  }
}

async function openShare(page: Page, path: string) {
  const response = await page.goto(path);
  await waitForLoadingGone(page);
  return response;
}

test.describe('Rewind share page', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await cleanUp();
    const prisma = createE2EPrismaClient();
    try {
      await prisma.config.update({ where: { id: 'config' }, data: { rewindPublicLinks: true } });
    } finally {
      await prisma.$disconnect();
    }
    await seedRewindIssue(TEST_USERS.ADMIN.id, 'heavy');
  });

  test.afterAll(cleanUp);

  // Every browser project signs in as the same admin, and `rw:share-actions`
  // allows 10 an hour: start each test with the budget full.
  test.beforeEach(async () => {
    if (process.env.REDIS_URL) await clearRateLimits(process.env.REDIS_URL, ['rw:share-actions']);
  });

  test('a logged-out visitor sees only the published cards, and the response says noindex', async ({ page }) => {
    const token = await createLink(['top-shows']);

    const response = await openShare(page, `/rewind/s/${token}`);

    expect(response?.status()).toBe(200);
    expect(response?.headers()['x-robots-tag']).toBe('noindex, nofollow');
    expect(response?.headers()['referrer-policy']).toBe('no-referrer');
    await expect(page.getByTestId('rewind-share-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    const cards = page.getByTestId('rewind-share-cards').getByRole('img');
    await expect(cards).toHaveCount(1);
    await expect(page.getByTestId('rewind-share-card-top-shows')).toBeVisible();
    await expect(cards.first()).toHaveAttribute('src', new RegExp(`^/api/rewind/card/s/[A-Za-z0-9_-]{${ASSET_KEY_LENGTH}}/top-shows$`));
    await expect(page.getByTestId('rewind-share-owner-banner')).toHaveCount(0);
    await expect(page.getByTestId('rewind-share-open-own')).toHaveCount(0);
    // No link, image, meta tag or text carries the token. The router's own
    // state in the inline scripts holds the page's URL, which the visitor has.
    const markup = await page.evaluate(() => {
      const copy = document.documentElement.cloneNode(true) as HTMLElement;
      copy.querySelectorAll('script').forEach((script) => script.remove());
      return copy.outerHTML;
    });
    expect(markup).not.toContain(token);

    const og = await page.locator('meta[property="og:image"]').getAttribute('content');
    expect(og).toMatch(/\/api\/rewind\/card\/s\/[A-Za-z0-9_-]{22}\/top-shows\?size=og$/);
    expect((await page.request.get(og!)).status()).toBe(200);
  });

  test('the owner sees the banner, and after a rotate the old URL is a 404 at once', async ({ adminPage }) => {
    const token = await createLink(['top-shows']);

    await openShare(adminPage, `/rewind/s/${token}`);
    const banner = adminPage.getByTestId('rewind-share-owner-banner');
    await expect(banner).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(banner.getByTestId('rewind-share-change-cards')).toHaveAttribute('href', `/rewind/${YEAR}?sheet=share`);

    await banner.getByTestId('rewind-share-rotate').click();
    await adminPage.getByTestId('rewind-share-rotate-confirm').click();
    const newUrl = adminPage.getByTestId('rewind-share-new-url');
    await expect(newUrl).toContainText('/rewind/s/');
    const fresh = new URL((await newUrl.textContent())!.trim()).pathname;

    expect((await adminPage.request.get(`/rewind/s/${token}`)).status()).toBe(404);
    expect((await adminPage.request.get(fresh)).status()).toBe(200);
  });

  test('a revoked link says it is no longer shared, with status 404', async ({ page }) => {
    const token = await createLink(['top-shows'], true);

    const response = await openShare(page, `/rewind/s/${token}`);

    expect(response?.status()).toBe(404);
    await expect(page.getByTestId('rewind-share-not-found')).toHaveText('This Rewind is no longer shared', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('rewind-share-cards')).toHaveCount(0);
  });

  test('an old /wrapped/share/<v2 token> lands on the v2 article here', async ({ page }) => {
    const token = newToken();
    await seedV2Share(token);

    await openShare(page, `/wrapped/share/${token}`);

    await expect(page).toHaveURL(new RegExp(`/rewind/s/${token}$`));
    await expect(page.getByTestId('rewind-share-v2')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId('rewind-share-v2-films')).toContainText('Test Movie');
  });

  test('axe at WCAG 2.2 AA finds no violations', async ({ page }) => {
    const token = await createLink(['cover', 'top-shows', 'clock']);
    await openShare(page, `/rewind/s/${token}`);
    await expect(page.getByTestId('rewind-share-cards')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('nextjs-portal').analyze();
    expect(results.violations.map((violation) => violation.id)).toEqual([]);
  });
});
