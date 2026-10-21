import { createHash, randomBytes } from 'node:crypto';

import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { currentPage, disableAutoplay, goToPage, openStage } from '../helpers/rewind-stage';
import { REWIND_ISSUES, REWIND_YEAR, seedRewindIssue } from '../helpers/seed-rewind';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * P7.7: hiding a title. The admin hides the No. 1 series of the heavy issue
 * from its row sheet; in a fresh, signed-out context the public share page
 * no longer names it and its poster is no longer served by the link's asset
 * key, before any regeneration. With `TEST_REDIS_URL` and a worker (CI), the
 * in-app list drops the title within 60 s, and Unhide brings it back.
 * `rewind-e2e-chromium` and `rewind-e2e-webkit` run it.
 */

const YEAR = REWIND_YEAR;
const heavy = REWIND_ISSUES.heavy;
const NO1_TITLE = heavy.facts['series[1].title'].display;
const NO1_KEY = (heavy.pages.find((p) => p.type === 'top-shows')!.data as { rows: Array<{ key: string }> }).rows[0].key.split(':')[1];

const TOKEN = randomBytes(32).toString('base64url');
const ASSET_KEY = randomBytes(16).toString('base64url');

async function cleanUp() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: YEAR } });
    await prisma.rewindPrefs.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: YEAR } });
    await prisma.rewindExclusion.deleteMany({ where: { userId: TEST_USERS.ADMIN.id } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Rewind hide a title', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await cleanUp();
    await seedRewindIssue(TEST_USERS.ADMIN.id, 'heavy');
    const prisma = createE2EPrismaClient();
    try {
      await prisma.config.update({ where: { id: 'config' }, data: { rewindPublicLinks: true, rewindAllowArtOnCards: true } });
      const wrapped = await prisma.plexWrapped.findUniqueOrThrow({ where: { userId_year: { userId: TEST_USERS.ADMIN.id, year: YEAR } }, select: { id: true } });
      await prisma.rewindShare.create({
        data: {
          wrappedId: wrapped.id,
          tokenHash: createHash('sha256').update(TOKEN).digest('hex'),
          assetKey: ASSET_KEY,
          pages: ['top-shows'],
          signed: false,
          includeArt: true,
          dailyDetail: false,
          cardFacts: [],
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(cleanUp);

  test('hides the No. 1 series from the row sheet, and the public link drops it at once', async ({ adminPage, browser }) => {
    await disableAutoplay(adminPage);
    await openStage(adminPage);
    await goToPage(adminPage, 'top-shows');

    await currentPage(adminPage).getByTestId('rewind-page-top-shows').getByTestId('rewind-title-button').first().click();
    const sheet = adminPage.getByTestId('rewind-row-sheet');
    await expect(sheet).toContainText(NO1_TITLE);
    await sheet.getByTestId('rewind-hide-title').click();
    await adminPage.getByTestId('rewind-hide-confirm').click();
    await expect(sheet.getByTestId('rewind-hide-done')).toHaveText('Hidden. Your pages update in about a minute.', {
      timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION,
    });

    const visitor = await browser.newContext();
    try {
      const page = await visitor.newPage();
      const response = await page.goto(`/rewind/s/${TOKEN}`);
      expect(response?.status()).toBe(200);
      await expect(page.locator('body')).not.toContainText(NO1_TITLE);
      expect((await page.request.get(`/api/rewind/poster/${NO1_KEY}?w=160&s=${ASSET_KEY}`)).status()).toBe(404);
      expect((await page.request.get(`/api/rewind/card/s/${ASSET_KEY}/top-shows`)).status()).toBe(200);
    } finally {
      await visitor.close();
    }
  });

  test('the in-app list drops the title after the regeneration, and Unhide brings it back', async ({ adminPage }) => {
    test.skip(!process.env.TEST_REDIS_URL, 'needs Redis and a Rewind worker');
    test.setTimeout(180_000);
    const no1 = () => adminPage.getByTestId('rewind-page-top-shows').locator('#rewind-top-shows-no1');

    await expect(async () => {
      await adminPage.goto(`/rewind/${YEAR}`);
      await expect(no1()).not.toContainText(NO1_TITLE);
    }).toPass({ timeout: 60_000 });

    await disableAutoplay(adminPage);
    await openStage(adminPage);
    await adminPage.getByTestId('rewind-settings').click();
    const hidden = adminPage.getByTestId('rewind-hidden-titles');
    await expect(hidden).toContainText(NO1_TITLE);
    await hidden.getByTestId(`rewind-unhide-${NO1_KEY}`).click();
    await expect(hidden).toContainText('You have not hidden any titles.');

    await expect(async () => {
      await adminPage.goto(`/rewind/${YEAR}`);
      await expect(no1()).toContainText(NO1_TITLE);
    }).toPass({ timeout: 60_000 });
  });
});
