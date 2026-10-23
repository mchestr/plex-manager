import fs from 'node:fs/promises';

import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { clearRateLimits } from './helpers/rate-limits';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * Your data on /account (P11.15): "Download my data" saves a JSON export
 * holding the member's own seeded mark, and deleting a mark from its row
 * menu keeps it gone after a reload.
 */

const MEMBER_ID = TEST_USERS.REGULAR.id;
const MARK_TITLE = 'E2E Export Mark';
const RATING_KEY = '987654';

async function resetMarks() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.userMediaMark.deleteMany({ where: { userId: MEMBER_ID, plexRatingKey: RATING_KEY } });
  } finally {
    await prisma.$disconnect();
  }
}

async function seedMark(): Promise<string> {
  const prisma = createE2EPrismaClient();
  try {
    const mark = await prisma.userMediaMark.create({
      data: {
        userId: MEMBER_ID,
        mediaType: 'MOVIE',
        plexRatingKey: RATING_KEY,
        title: MARK_TITLE,
        year: 2024,
        markType: 'KEEP_FOREVER',
        markedVia: 'discord',
      },
    });
    return mark.id;
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Your data', () => {
  test.describe.configure({ mode: 'serial' });
  test.beforeEach(async () => {
    await resetMarks();
    if (process.env.REDIS_URL) await clearRateLimits(process.env.REDIS_URL, ['account:export', 'account:data']);
  });
  test.afterAll(resetMarks);

  test('downloads a JSON export with the seeded mark', async ({ regularUserPage: page }) => {
    await seedMark();
    await page.goto('/account');
    const button = page.getByTestId('account-export-button');
    await expect(button).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    const [download] = await Promise.all([page.waitForEvent('download'), button.click()]);
    expect(download.suggestedFilename()).toMatch(/^plex-manager-data-\d{4}-\d{2}-\d{2}\.json$/);
    const file = await download.path();
    const data = JSON.parse(await fs.readFile(file, 'utf8'));

    expect(data.format).toBe('plex-manager-member-export');
    expect(data.version).toBe(1);
    expect(data.marks).toEqual(expect.arrayContaining([expect.objectContaining({ title: MARK_TITLE, markType: 'KEEP_FOREVER' })]));
    expect(JSON.stringify(data)).not.toMatch(/plexAuthToken|tokenHash|accessToken/);
  });

  test('a deleted mark stays gone after a reload', async ({ regularUserPage: page }) => {
    const markId = await seedMark();
    await page.goto('/account');
    const row = page.getByTestId(`account-marks-row-${markId}`);
    await expect(row).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    await page.getByTestId(`account-marks-actions-${markId}`).click();
    await page.getByTestId(`account-mark-delete-${markId}`).click();
    await expect(page.getByTestId('account-mark-delete-dialog')).toBeVisible();
    await page.getByTestId('account-mark-delete-confirm').click();
    await expect(page.getByTestId('account-mark-delete-dialog')).toBeHidden();
    await expect(row).toBeHidden();

    await page.reload();
    await expect(page.getByTestId('account-marks')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId(`account-marks-row-${markId}`)).toHaveCount(0);
  });
});
