import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { clearRateLimits } from './helpers/rate-limits';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * Your data on /account (P11.15): deleting a mark from its row menu keeps it
 * gone after a reload.
 */

const MEMBER_ID = TEST_USERS.REGULAR.id;
const MARK_TITLE = 'E2E Data Mark';
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
    if (process.env.REDIS_URL) await clearRateLimits(process.env.REDIS_URL, ['account:data']);
  });
  test.afterAll(resetMarks);

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
