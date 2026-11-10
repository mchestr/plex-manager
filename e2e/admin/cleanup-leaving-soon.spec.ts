import { join } from 'node:path';

import type { Locator, Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth';
import { cleanupSeedIds, movieKey, showKey } from '../helpers/cleanup-fixtures';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearCleanup, restorePlex, seedCleanup, type SeededCleanup, useCleanupPlex, wipeCleanup } from '../helpers/seed-cleanup';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * The Leaving soon tab of Media cleanup (TS 16.4, UX 4.7): the groups, the
 * selection and the bulk bar, a bulk Postpone and a row Exclude, the
 * deletion batch approval with the typed count above 50, an unticked batch
 * row that stays unticked after an exclusion from the Why Sheet (E36), the
 * selection over a tab switch and a reload, the stale alert, the entry batch
 * approval, and last the footer Postpone of the batch above 50 with one row
 * unticked on page 2 (E37).
 *
 * No case presses "Delete {N} {items}": the approval case closes the dialog
 * once the typed count enables the button. The press and the act job are in
 * `cleanup-pipeline.spec.ts` (delivery-r7-1). So no case needs the job
 * queue, and every case runs locally. The stale case changes the shows batch
 * in the database, then its footer Postpone meets the change.
 *
 * With `CLEANUP_SHOTS_DIR` set, the tab is saved at 1440 x 900 and 390 x 844
 * for the comparison with the mockups.
 */

const IDS = cleanupSeedIds();
const SHOTS = process.env.CLEANUP_SHOTS_DIR;
const URL = '/admin/cleanup?tab=leaving-soon';
const REVIEW = `admin-cleanup-batch-${IDS.batches.review}`;
const SHOWS = `admin-cleanup-batch-${IDS.batches.shows}`;
const ENTRY = `admin-cleanup-batch-${IDS.batches.entry}`;
let seeded: SeededCleanup;

const toast = (page: Page, text: string | RegExp) => page.getByTestId('toast').filter({ hasText: text }).first();
const batchRows = (page: Page, base = REVIEW) => page.getByTestId(`${base}-table`).locator('tbody tr');
const keyOf = async (row: Locator, base = REVIEW) => ((await row.getAttribute('data-testid')) ?? '').replace(`${base}-row-`, '');
const box = (page: Page, key: string, base = REVIEW) => page.getByTestId(`${base}-row-${key}-select`);

/** The count in the heading of a deletion batch card: "55 movies wait for your approval". */
async function batchCount(page: Page, base = REVIEW): Promise<number> {
  const text = await page.getByTestId(base).getByRole('heading').first().textContent();
  return Number(/^(\d+)/.exec(text ?? '')?.[1] ?? 0);
}

async function open(page: Page) {
  await page.goto(URL);
  await expect(page.getByTestId('admin-cleanup-leaving-tab')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  // The footer buttons wait until the client read the stored selection
  await expect(page.getByTestId(`${REVIEW}-approve`)).not.toHaveAttribute('aria-disabled', 'true');
}

/** Saves the page at both widths of the mockups, then puts the viewport back. */
async function shoot(page: Page, name: string) {
  if (!SHOTS) return;
  const before = page.viewportSize();
  for (const [width, height] of [[1440, 900], [390, 844]] as const) {
    await page.setViewportSize({ width, height });
    await page.waitForTimeout(300);
    await page.screenshot({ path: join(SHOTS, `${name}-${width}.png`), fullPage: true });
  }
  if (before) await page.setViewportSize(before);
}

test.describe('Media cleanup Leaving soon', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    seeded = await seedCleanup();
    await useCleanupPlex();
  });

  test.afterAll(async () => {
    await wipeCleanup();
    await clearCleanup();
    await restorePlex();
  });

  test('shows the batch cards, then the groups, the selection and the bulk bar', async ({ adminPage: page }) => {
    await open(page);
    await expect(page.getByTestId(REVIEW).getByRole('heading', { name: '55 movies wait for your approval' })).toBeVisible();
    await expect(page.getByTestId(SHOWS).getByRole('heading', { name: '3 shows wait for your approval' })).toBeVisible();
    await expect(page.getByTestId(ENTRY)).toContainText('Held by the entry check');
    await expect(batchRows(page)).toHaveCount(10);
    await expect(page.getByTestId(`${REVIEW}-show-all`)).toHaveText('Show all 55');
    await expect(page.getByTestId('admin-cleanup-leaving-exits')).toContainText('In the last 7 days');

    const due = page.getByTestId('admin-cleanup-leaving-group-due');
    await expect(due.getByRole('rowheader')).toContainText(/^Today, .+Shown above\.$/);
    await expect(due.getByRole('rowheader')).toHaveAttribute('scope', 'rowgroup');
    const later = [movieKey(seeded.world, 'later-a'), showKey(seeded.world, 'auto-a', 1)];
    for (const key of later) await page.getByTestId(`admin-cleanup-leaving-row-${key}-select`).click();
    const bar = page.getByRole('region', { name: 'Selection' });
    await expect(bar).toContainText('2 selected');
    await shoot(page, 'leaving-soon');
    await page.getByTestId('admin-cleanup-leaving-bulk-clear').click();
    await expect(bar).toHaveCount(0);
  });

  test('postpones a title from the bulk bar, and excludes one from its row menu', async ({ adminPage: page }) => {
    await open(page);
    const laterA = movieKey(seeded.world, 'later-a');
    await page.getByTestId(`admin-cleanup-leaving-row-${laterA}-select`).click();
    await page.getByTestId('admin-cleanup-leaving-bulk-postpone').click();
    await expect(page.getByTestId('admin-cleanup-postpone-dialog')).toContainText('Postpone 1 title?');
    await page.getByTestId('admin-cleanup-postpone-confirm').click();
    await expect(toast(page, '1 title postponed.')).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(page.getByTestId(`admin-cleanup-leaving-row-${laterA}`)).toContainText('Postponed');
    await expect(page.getByRole('heading', { name: 'Everything in Leaving soon' })).toBeFocused();

    const laterB = movieKey(seeded.world, 'later-b');
    await page.getByTestId(`admin-cleanup-leaving-actions-${laterB}`).click();
    await page.getByTestId(`admin-cleanup-leaving-actions-${laterB}-exclude`).click();
    await page.getByTestId('admin-cleanup-exclude-confirm').click();
    await expect(toast(page, 'Movie excluded.')).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(page.getByTestId(`admin-cleanup-leaving-row-${laterB}`)).toHaveCount(0);
  });

  test('asks for the typed count above 50 to approve the batch, and never deletes', async ({ adminPage: page }) => {
    await open(page);
    const count = await batchCount(page);
    await page.getByTestId(`${REVIEW}-approve`).click();
    const dialog = page.getByTestId('admin-cleanup-approve-dialog');
    await expect(dialog).toContainText(`Delete ${count} movies and their files in Radarr?`);
    await expect(dialog.getByTestId('admin-cleanup-approve-titles').getByRole('listitem')).toHaveCount(10);
    await expect(dialog.getByTestId('admin-cleanup-approve-titles')).toContainText(`and ${count - 10} more`);
    const confirm = page.getByTestId('admin-cleanup-approve-confirm');
    await expect(confirm).toContainText(new RegExp(`^Delete ${count} movies`));
    await expect(confirm).toBeDisabled();
    await page.getByTestId('admin-cleanup-approve-dialog-confirm-text').fill(String(count));
    await expect(confirm).toBeEnabled();
    // The press and the act job belong to cleanup-pipeline.spec.ts: close the dialog here
    await dialog.getByRole('button', { name: 'Cancel' }).click();
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId(`${REVIEW}-approve`)).toBeFocused();
  });

  test('keeps an unticked batch row unticked after an exclusion of another batch row from its Why Sheet', async ({ adminPage: page }) => {
    await open(page);
    const count = await batchCount(page);
    const kept = await keyOf(batchRows(page).nth(1));
    const excluded = await keyOf(batchRows(page).nth(2));
    await box(page, kept).click();
    await expect(box(page, kept)).toHaveAttribute('aria-checked', 'false');
    await page.getByTestId(`${REVIEW}-row-${excluded}-why`).click();
    await page.getByTestId('admin-cleanup-why-exclude').click();
    await page.getByTestId('admin-cleanup-exclude-confirm').click();
    await expect(toast(page, 'Movie excluded.')).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(page.getByTestId(REVIEW).getByRole('heading', { name: `${count - 1} movies wait for your approval` })).toBeVisible();
    await expect(page.getByTestId(`${REVIEW}-row-${excluded}-select`)).toHaveCount(0);
    await expect(box(page, kept)).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId(`${REVIEW}-changed`)).toHaveCount(0);
    await expect(page.getByTestId(`${REVIEW}-footer`)).toContainText(`${count - 2} selected`);
  });

  test('keeps the selection over a tab switch and a reload', async ({ adminPage: page }) => {
    await open(page);
    const count = await batchCount(page);
    const key = await keyOf(batchRows(page).nth(4));
    await box(page, key).click();
    const footer = page.getByTestId(`${REVIEW}-footer`);
    await expect(footer).toContainText(`${count - 1} selected`);
    await page.getByTestId('admin-cleanup-leaving-exits-history').click();
    await expect(page.getByTestId('admin-cleanup-tab-history')).toHaveAttribute('aria-selected', 'true');
    await page.getByTestId('admin-cleanup-tab-leaving-soon').click();
    await expect(box(page, key)).toHaveAttribute('aria-checked', 'false', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(footer).toContainText(`${count - 1} selected`);
    await page.reload();
    await expect(box(page, key)).toHaveAttribute('aria-checked', 'false', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(footer).toContainText(`${count - 1} selected`);
  });

  test('shows the changed alert when the batch changed under the footer Postpone', async ({ adminPage: page }) => {
    await open(page);
    // Another admin postponed one show meanwhile: it is no longer due
    const prisma = createE2EPrismaClient();
    try {
      const leaveOn = new Date(Date.now() + 9 * 86_400_000).toISOString().slice(0, 10);
      await prisma.cleanupItem.updateMany({ where: { itemKey: showKey(seeded.world, 'ended-a') }, data: { leaveOn } });
    } finally {
      await prisma.$disconnect();
    }
    await page.getByTestId(`${SHOWS}-postpone`).click();
    await page.getByTestId('admin-cleanup-postpone-confirm').click();
    await expect(page.getByTestId(`${SHOWS}-changed`)).toHaveText('The numbers changed. Check them again.', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.getByTestId(SHOWS).getByRole('heading', { name: '2 shows wait for your approval' })).toBeVisible();
    await expect(page.getByTestId(`${SHOWS}-postpone`)).toBeFocused();
  });

  test('puts the held matches of the entry batch in Leaving soon', async ({ adminPage: page }) => {
    await open(page);
    await page.getByTestId(`${ENTRY}-put`).click();
    await expect(page.getByTestId('admin-cleanup-entry-dialog')).toContainText('Put 3 seasons in Leaving soon?');
    await page.getByTestId('admin-cleanup-entry-confirm').click();
    await expect(toast(page, '3 titles put in Leaving soon.')).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(page.getByTestId(ENTRY)).toHaveCount(0);
  });

  // Last: it moves the batch above 50 that the typed case needs (delivery-r6-9)
  test('postpones every selected row of the batch from the footer, with one row unticked on page 2', async ({ adminPage: page }) => {
    await open(page);
    const count = await batchCount(page);
    await page.getByTestId(`${REVIEW}-show-all`).click();
    await page.getByTestId(`${REVIEW}-page-next`).click();
    await expect(page).toHaveURL(/batchPage=2/);
    const key = await keyOf(batchRows(page).first());
    await box(page, key).click();
    await expect(page.getByTestId(`${REVIEW}-footer`)).toContainText(`${count - 1} selected`);
    await page.getByTestId(`${REVIEW}-postpone`).click();
    await expect(page.getByTestId('admin-cleanup-postpone-dialog')).toContainText(`Postpone ${count - 1} titles?`);
    await page.getByTestId('admin-cleanup-postpone-confirm').click();
    await expect(toast(page, `${count - 1} titles postponed.`)).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(page.getByTestId(REVIEW).getByRole('heading', { name: '1 movie waits for your approval' })).toBeVisible();
    await expect(box(page, key)).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByTestId(`${REVIEW}-changed`)).toHaveCount(0);
  });
});
