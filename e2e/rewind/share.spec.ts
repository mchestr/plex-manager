import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearRateLimits } from '../helpers/rate-limits';
import { REWIND_YEAR, seedRewindIssue } from '../helpers/seed-rewind';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * P5.11: the share sheet and opt-in public links. A link is created through
 * the confirm step, its asset key (read through the E2E Prisma client) serves
 * the cover card; after a rotate the old key is a 404 and the new one works,
 * and after Stop sharing the new key is a 404 too. A stubbed `navigator.share`
 * receives the card as a `File`. `rewind-e2e-chromium` and `rewind-e2e-webkit`
 * run it (P5.4); P7.5 adds the share page checks. The issue is the heavy
 * golden fixture (`e2e/helpers/seed-rewind.ts`), seeded for the admin.
 */

const YEAR = REWIND_YEAR;

async function liveAssetKey(): Promise<string | null> {
  const prisma = createE2EPrismaClient();
  try {
    const share = await prisma.rewindShare.findFirst({
      where: { wrapped: { userId: TEST_USERS.ADMIN.id, year: YEAR }, revokedAt: null },
      orderBy: { createdAt: 'desc' },
      select: { assetKey: true },
    });
    return share?.assetKey ?? null;
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanUp() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: YEAR } });
    await prisma.rewindPrefs.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: YEAR } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Rewind share sheet', () => {
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

  test('creates, rotates and stops a public link', async ({ adminPage }) => {
    await adminPage.goto(`/rewind/${YEAR}?sheet=share`);
    const sheet = adminPage.getByTestId('rewind-share-sheet');
    await expect(sheet).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(adminPage.getByTestId('rewind-stage')).toHaveAttribute('data-mode', 'sheet');
    await expect(sheet.getByTestId('rewind-share-preview')).toBeVisible();

    await sheet.getByTestId('rewind-share-copy-link').click();
    await expect(sheet.getByTestId('rewind-share-confirm-line')).toContainText('Anyone with the link will see these');
    await sheet.getByTestId('rewind-share-create').click();
    await expect(sheet.getByTestId('rewind-share-url')).toContainText('/rewind/s/');

    const first = await liveAssetKey();
    expect(first).not.toBeNull();
    expect((await adminPage.request.get(`/api/rewind/card/s/${first}/cover`)).status()).toBe(200);

    // A later visit no longer knows the URL: copying makes a new address and stops the old one.
    await adminPage.goto(`/rewind/${YEAR}?sheet=share`);
    await expect(sheet.getByTestId('rewind-share-copy-link')).toHaveText('Copy a new link', { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await sheet.getByTestId('rewind-share-copy-link').click();
    await sheet.getByTestId('rewind-share-create').click();
    await expect(sheet.getByTestId('rewind-share-url')).toContainText('/rewind/s/');

    const second = await liveAssetKey();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect((await adminPage.request.get(`/api/rewind/card/s/${first}/cover`)).status()).toBe(404);
    expect((await adminPage.request.get(`/api/rewind/card/s/${second}/cover`)).status()).toBe(200);

    await sheet.getByTestId('rewind-share-stop').click();
    await expect(sheet.getByTestId('rewind-share-copy-link')).toHaveText('Create a public link');
    expect((await adminPage.request.get(`/api/rewind/card/s/${second}/cover`)).status()).toBe(404);
  });

  test('hands the card to navigator.share as a File', async ({ adminPage }) => {
    await adminPage.addInitScript(() => {
      const record = window as unknown as { sharedFiles?: string[] };
      Object.defineProperty(navigator, 'canShare', { configurable: true, value: () => true });
      Object.defineProperty(navigator, 'share', {
        configurable: true,
        value: async (data: { files?: File[] }) => {
          record.sharedFiles = (data.files ?? []).map((file) => (file instanceof File ? `${file.name}:${file.type}` : 'not a file'));
        },
      });
    });
    await adminPage.goto(`/rewind/${YEAR}?sheet=share`);
    const button = adminPage.getByTestId('rewind-share-image');
    await expect(button).toBeEnabled({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await button.click();
    await expect
      .poll(() => adminPage.evaluate(() => (window as unknown as { sharedFiles?: string[] }).sharedFiles))
      .toEqual([`rewind-${YEAR}-cover.png:image/png`]);
  });
});
