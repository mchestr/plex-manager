import heavyIssue from '../fixtures/rewind/heavy-issue.json';
import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * P5.11: the share sheet and opt-in public links. A link is created through
 * the confirm step, its asset key (read through the E2E Prisma client) serves
 * the cover card; after a rotate the old key is a 404 and the new one works,
 * and after Stop sharing the new key is a 404 too. A stubbed `navigator.share`
 * receives the card as a `File`. P5.4 runs this on chromium and webkit; until
 * its projects land it runs in `chromium`. P7.5 adds the share page checks.
 */

const YEAR = 2026;

// The heavy golden fixture as the pipeline builds it; lib/rewind/__tests__/e2e-issue-fixture.test.ts keeps it current
function seedIssue() {
  return {
    version: 3,
    year: YEAR,
    statsVersion: 'stats-2026.1',
    generatedAt: new Date('2026-12-01T12:00:00Z').toISOString(),
    window: { from: '2026-01-01', through: '2026-11-30', zone: 'America/Chicago', finalCut: false },
    edition: heavyIssue.edition,
    facts: heavyIssue.facts,
    pages: heavyIssue.pages,
    archetype: heavyIssue.archetype,
    copy: null,
    copySource: 'template',
    copyMeta: { model: null, promptVersion: 'e2e', slotHashes: {} },
    factsHash: 'e2e',
  };
}

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
    const data = seedIssue();
    const prisma = createE2EPrismaClient();
    try {
      await prisma.config.update({ where: { id: 'config' }, data: { rewindPublicLinks: true } });
      await prisma.plexWrapped.create({
        data: { userId: TEST_USERS.ADMIN.id, year: YEAR, status: 'completed', dataVersion: 3, data: JSON.stringify(data), generatedAt: new Date(data.generatedAt) },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(cleanUp);

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
    await expect(sheet.getByTestId('rewind-share-copy-link')).toHaveText('Copy a new link...', { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await sheet.getByTestId('rewind-share-copy-link').click();
    await sheet.getByTestId('rewind-share-create').click();
    await expect(sheet.getByTestId('rewind-share-url')).toContainText('/rewind/s/');

    const second = await liveAssetKey();
    expect(second).not.toBeNull();
    expect(second).not.toBe(first);
    expect((await adminPage.request.get(`/api/rewind/card/s/${first}/cover`)).status()).toBe(404);
    expect((await adminPage.request.get(`/api/rewind/card/s/${second}/cover`)).status()).toBe(200);

    await sheet.getByTestId('rewind-share-stop').click();
    await expect(sheet.getByTestId('rewind-share-copy-link')).toHaveText('Create a public link...');
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
