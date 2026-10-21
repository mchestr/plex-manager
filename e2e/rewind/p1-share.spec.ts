import AxeBuilder from '@axe-core/playwright';
import { readFile } from 'node:fs/promises';

import { unzipSync } from 'fflate';

import { expect, test, TEST_USERS } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { disableAutoplay, goToPage, openStage } from '../helpers/rewind-stage';
import { REWIND_YEAR, seedRewindIssue } from '../helpers/seed-rewind';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * P8.4: the P1 comparison, Save all and the core pages' Notes, each behind
 * its `+key` flag in `Config.rewindDisabledPages`, on the heavy golden
 * fixture seeded for the admin. The flags are switched on for this spec and
 * restored after it.
 */

const FLAGS = ['+number.compare-2025', '+share.save-all', '+share.edit-card', '+notes.core'];
const CORE_NOTES = ['cover', 'number', 'bookends', 'top-films', 'clock', 'back-cover'];

async function setFlags(on: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    const config = await prisma.config.findUnique({ where: { id: 'config' }, select: { rewindDisabledPages: true } });
    const stored = Array.isArray(config?.rewindDisabledPages) ? (config.rewindDisabledPages as string[]) : [];
    const kept = stored.filter((entry) => !FLAGS.includes(entry));
    await prisma.config.update({ where: { id: 'config' }, data: { rewindDisabledPages: on ? [...kept, ...FLAGS] : kept } });
  } finally {
    await prisma.$disconnect();
  }
}

async function cleanUp() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: REWIND_YEAR } });
    await prisma.rewindPrefs.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: REWIND_YEAR } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Rewind P1 share and Notes', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await cleanUp();
    await setFlags(true);
    await seedRewindIssue(TEST_USERS.ADMIN.id, 'heavy');
  });

  test.afterAll(async () => {
    await setFlags(false);
    await cleanUp();
  });

  test('Save all downloads one ZIP of every card', async ({ adminPage }) => {
    await adminPage.goto(`/rewind/${REWIND_YEAR}?sheet=share`);
    const sheet = adminPage.getByTestId('rewind-share-sheet');
    await expect(sheet).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    const button = sheet.getByTestId('rewind-save-all');
    // The heavy fixture has no Guess page: 14 cards with Daily detail off (P7.6).
    await expect(button).toHaveText('Save all 14 cards');

    const [download] = await Promise.all([adminPage.waitForEvent('download', { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION }), button.click()]);
    expect(download.suggestedFilename()).toBe(`rewind-${REWIND_YEAR}-cards.zip`);
    const files = unzipSync(new Uint8Array(await readFile((await download.path())!)));
    expect(Object.keys(files)).toHaveLength(14);
    expect(Object.keys(files)).toContain('01-cover.png');
  });

  test('Compare with 2025 toggles on page 02', async ({ adminPage }) => {
    await disableAutoplay(adminPage);
    await openStage(adminPage);
    await goToPage(adminPage, 'number');
    const toggle = adminPage.getByTestId('rewind-compare-2025');
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await toggle.click();
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(adminPage.getByTestId('rewind-compare-strip')).toHaveAttribute('data-compare', 'true');
    // The tap never turned the page.
    await expect(adminPage.getByTestId('rewind-page-number')).toBeVisible();
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1366, height: 768 }]) {
    test(`the core pages have Notes at ${viewport.width}x${viewport.height}`, async ({ adminPage }) => {
      await adminPage.setViewportSize(viewport);
      await disableAutoplay(adminPage);
      await openStage(adminPage);
      const notes = adminPage.getByTestId('rewind-notes-body');
      for (const type of CORE_NOTES) {
        await goToPage(adminPage, type);
        await expect(notes.getByRole('heading').first()).toBeVisible();
      }
      const results = await new AxeBuilder({ page: adminPage }).include('[data-testid="rewind-notes"]').analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
