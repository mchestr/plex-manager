import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth';
import { CLEANUP_PREFIX } from '../helpers/cleanup-fixtures';
import { clearCleanup, restorePlex, seedCleanup, useCleanupPlex, wipeCleanup } from '../helpers/seed-cleanup';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * The Kept and excluded tab and the History tab of Media cleanup (TS 16.4,
 * UX 4.8, 4.9): end a member's Keep, give an exclusion a new end date and
 * remove another, then the runs table with its outcomes and audit link, and
 * the stored Why of a deleted title, read only.
 *
 * With `CLEANUP_SHOTS_DIR` set, the History tab is saved at 1440 x 900 and
 * 390 x 844 for the comparison with the mockups.
 */

const P = CLEANUP_PREFIX;
const SHOTS = process.env.CLEANUP_SHOTS_DIR;
const toast = (page: Page, text: string) => page.getByTestId('toast').filter({ hasText: text }).first();

async function openTab(page: Page, tab: 'kept' | 'history') {
  await page.goto(`/admin/cleanup?tab=${tab}`);
  await expect(page.getByTestId(`admin-cleanup-tab-${tab}`)).toHaveAttribute('aria-selected', 'true', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
}

/** Opens a row's action menu and picks an action; server-rendered rows can need a click retry until hydration. */
async function rowAction(page: Page, rowId: string, action: string) {
  const item = page.getByTestId(`admin-cleanup-kept-actions-${rowId}-${action}`);
  await expect(async () => {
    await page.getByTestId(`admin-cleanup-kept-actions-${rowId}`).click();
    await expect(item).toBeVisible({ timeout: 1000 });
  }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  await item.click();
}

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

test.describe('Media cleanup Kept and excluded, and History', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    await seedCleanup();
    await useCleanupPlex();
  });

  test.afterAll(async () => {
    await wipeCleanup();
    await clearCleanup();
    await restorePlex();
  });

  test('ends a member Keep', async ({ adminPage: page }) => {
    await openTab(page, 'kept');
    const row = page.getByTestId(`admin-cleanup-kept-row-${P}-keep`);
    await expect(row).toContainText('Kept');
    await rowAction(page, `${P}-keep`, 'end-keep');
    await page.getByTestId('admin-cleanup-end-keep-confirm').click();
    await expect(toast(page, 'Keep ended')).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(row).toHaveCount(0);
  });

  test('gives an exclusion a new end date, and removes another', async ({ adminPage: page }) => {
    await openTab(page, 'kept');
    const movie = page.getByTestId(`admin-cleanup-kept-row-${P}-exclude-movie`);
    await expect(movie).toContainText('No end date');
    await rowAction(page, `${P}-exclude-movie`, 'change-end-date');
    await page.getByTestId('admin-cleanup-end-date-until').getByRole('radio', { name: 'A date' }).click();
    const until = new Date(Date.now() + 40 * 86_400_000).toISOString().slice(0, 10);
    await page.getByTestId('admin-cleanup-end-date-date').fill(until);
    await page.getByTestId('admin-cleanup-end-date-save').click();
    await expect(toast(page, 'End date changed')).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(movie).not.toContainText('No end date');

    const show = page.getByTestId(`admin-cleanup-kept-row-${P}-exclude-show`);
    await rowAction(page, `${P}-exclude-show`, 'remove-exclusion');
    await page.getByTestId('admin-cleanup-remove-exclusion-confirm').click();
    await expect(toast(page, 'Exclusion removed')).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    await expect(show).toHaveCount(0);
  });

  test('lists the runs with their outcomes and links each to its audit rows', async ({ adminPage: page }) => {
    await openTab(page, 'history');
    const runs = page.getByTestId('admin-cleanup-runs');
    await expect(runs.getByRole('table', { name: 'Runs' })).toBeVisible();
    await expect(page.getByTestId(`admin-cleanup-runs-row-${P}-run-nightly`)).toContainText('The schedule');
    await expect(page.getByTestId(`admin-cleanup-runs-row-${P}-run-dry`)).toContainText('Dry run of Movies nobody played in two years');
    await expect(page.getByTestId(`admin-cleanup-runs-row-${P}-run-act`)).toContainText('Finished. 1 failed:');
    await expect(page.getByTestId(`admin-cleanup-deleted-row-${P}-out-failed`)).toContainText('Failed');
    await shoot(page, 'history');

    const audit = page.getByTestId(`admin-cleanup-runs-link-${P}-run-nightly`);
    await expect(audit).toHaveAttribute('href', `/admin/audit?run=${P}-run-nightly`);
    await audit.click();
    await expect(page).toHaveURL(new RegExp(`/admin/audit\\?run=${P}-run-nightly`), { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });

  test('opens the stored Why of a deleted title, read only', async ({ adminPage: page }) => {
    await openTab(page, 'history');
    const row = page.getByTestId(`admin-cleanup-deleted-row-${P}-out-deleted`);
    await expect(row).toContainText('The Gilded Orchard');
    await expect(row).toContainText('Deleted');
    const why = page.getByTestId(`admin-cleanup-deleted-row-${P}-out-deleted-why`);
    await expect(async () => {
      await why.click();
      await expect(page.getByTestId('admin-cleanup-why')).toBeVisible({ timeout: 1000 });
    }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    const sheet = page.getByTestId('admin-cleanup-why');
    await expect(sheet.getByTestId('admin-cleanup-why-summary')).toContainText('Radarr deleted it', { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(sheet.getByTestId('admin-cleanup-why-exclude')).toHaveCount(0);
    await expect(sheet.getByTestId('admin-cleanup-why-postpone')).toHaveCount(0);
    await sheet.getByTestId('admin-cleanup-why-close').click();
    await expect(sheet).toHaveCount(0);
    await expect(why).toBeFocused();
  });
});
