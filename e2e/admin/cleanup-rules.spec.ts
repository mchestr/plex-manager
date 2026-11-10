import { join } from 'node:path';

import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/auth';
import { cleanupSeedIds } from '../helpers/cleanup-fixtures';
import { createE2EPrismaClient } from '../helpers/prisma';
import { clearCleanup, clearCleanupA11yRules, seedCleanup, wipeCleanup } from '../helpers/seed-cleanup';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * The Rules tab of Media cleanup (TS 16.4, UX 4.1): the first-use state
 * with the recipes and their counts, the recipe Sheet whose counts change
 * with a chip and "Create rule (dry run)", the rule cards by mode, the menu
 * actions (duplicate, delete, and "Run dry run now" with the job queue), and
 * the batch alert.
 *
 * Each group seeds through `seedCleanup()` (TS 16.4), so no case reads the
 * state that an earlier one changed. "Create rule (dry run)" opens the rule
 * page of `w5-admin-editor`, and the batch alert link opens the Leaving soon
 * tab of `w5-leaving-history`: they carry the tags of plan D20. "dry run
 * now" needs the job queue, so it skips without `REDIS_URL` and runs last.
 *
 * With `CLEANUP_SHOTS_DIR` set, the first-use and normal states are also
 * saved at 1440 x 900 and 390 x 844 for the comparison with the mockups.
 */

const IDS = cleanupSeedIds();
const SHOTS = process.env.CLEANUP_SHOTS_DIR;
const card = (page: Page, ruleId: string) => page.getByTestId(`admin-cleanup-rule-${ruleId}`);

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

async function setFeature(enabled: boolean) {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.cleanupSettings.update({ where: { id: 'cleanup' }, data: { enabled } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Media cleanup rules', () => {
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    await wipeCleanup();
    await clearCleanup();
  });

  test.describe('first use', () => {
    test.beforeAll(async () => {
      await seedCleanup();
      // No rule, so the tab is the recipe gallery. The library data stays, for the counts
      await clearCleanupA11yRules();
      await setFeature(false);
    });

    test('shows the off alert, the steps, the library tiles and every recipe with its count today', async ({ adminPage: page }) => {
      await page.goto('/admin/cleanup');
      await expect(page.getByTestId('admin-cleanup-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      // Media cleanup is the last tab of Automations, and lights it
      await expect(page.getByTestId('admin-section-tab-cleanup')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId('admin-sidebar').getByTestId('admin-nav-automations').first()).toHaveAttribute('aria-current', 'page');
      await expect(page.getByTestId('admin-cleanup-tab-rules')).toHaveAttribute('aria-selected', 'true');
      // On first use the page header has no action
      await expect(page.getByTestId('admin-cleanup-new-rule')).toHaveCount(0);
      await expect(page.getByTestId('admin-cleanup-pause')).toHaveCount(0);

      await expect(page.getByTestId('admin-cleanup-alert-off')).toContainText('Media cleanup is off');
      await expect(page.getByTestId('admin-cleanup-alert-off')).toHaveCount(1);
      await expect(page.getByTestId('admin-cleanup-alert-off-settings')).toHaveAttribute('href', '/admin/cleanup?tab=settings&section=cleanup-feature');
      await expect(page.getByTestId('admin-cleanup-steps')).toContainText('Pick a recipe');
      await expect(page.getByTestId('admin-cleanup-library-tiles')).toContainText('Movies');
      await expect(page.getByRole('heading', { level: 2, name: 'Start with a recipe' })).toBeVisible();
      await expect(page.getByTestId('admin-cleanup-data-timestamp')).toBeVisible();

      const recipes = page.getByTestId('admin-cleanup-recipes');
      await expect(recipes.locator('[data-slot="card"]')).toHaveCount(11);
      await expect(page.getByTestId('admin-cleanup-recipe-never-watched-movies-count')).toHaveText(/^\d[\d,]* movies?, [\d.]+ [KMGT]?B$/);
      await expect(page.getByTestId('admin-cleanup-recipe-never-watched-movies-posters').locator('[data-slot="poster"]')).toHaveCount(5);
      await expect(page.getByTestId('admin-cleanup-recipe-never-watched-movies-sentence').locator('[data-slot="value-chip"]')).toHaveText('180 days');
      await expect(page.getByTestId('admin-cleanup-recipe-requested-never-watched-count')).toHaveText(/^\d[\d,]* movies? or \d[\d,]* shows?$/);
      await expect(page.getByTestId('admin-cleanup-recipe-blank-start')).toHaveAttribute('href', '/admin/cleanup/rules/new?level=movie');

      await shoot(page, 'rules-first-use');
    });

    test('the recipe Sheet counts again when a chip changes', async ({ adminPage: page }) => {
      await page.goto('/admin/cleanup');
      const use = page.getByTestId('admin-cleanup-recipe-never-watched-movies-use');
      const sheet = page.getByTestId('admin-cleanup-recipe-sheet');
      // Server-rendered: a click before hydration does nothing, so it repeats until the Sheet opens
      await expect(async () => {
        await use.click();
        await expect(sheet).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      const count = sheet.getByTestId('admin-cleanup-recipe-count');
      await expect(count).toHaveText(/^\d+$/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      const first = Number(await count.textContent());
      await sheet.getByTestId('admin-cleanup-recipe-value-added-option-2y').click();
      // Two years leaves out the movies added between 180 days and 2 years ago
      await expect.poll(async () => Number(await count.textContent()), { timeout: WAIT_TIMEOUTS.PAGE_CONTENT }).toBeLessThan(first);
      await expect(sheet.getByTestId('admin-cleanup-recipe-value-added-option-2y')).toHaveAttribute('aria-checked', 'true');

      await page.keyboard.press('Escape');
      await expect(sheet).toHaveCount(0);
      await expect(use).toBeFocused();
    });

    test('Create rule (dry run) saves the rule and opens it @needs-editor', async ({ adminPage: page }) => {
      await page.goto('/admin/cleanup');
      const sheet = page.getByTestId('admin-cleanup-recipe-sheet');
      await expect(async () => {
        await page.getByTestId('admin-cleanup-recipe-never-watched-movies-use').click();
        await expect(sheet).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(sheet.getByTestId('admin-cleanup-recipe-count')).toHaveText(/^\d+$/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      await sheet.getByTestId('admin-cleanup-recipe-create').click();
      await expect(page).toHaveURL(/\/admin\/cleanup\/rules\/[A-Za-z0-9_-]+$/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(page.getByTestId('admin-cleanup-editor-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(page.getByTestId('admin-cleanup-editor-mode')).toContainText('Dry run');
    });
  });

  test.describe('normal use', () => {
    test.beforeEach(async () => {
      await seedCleanup();
    });

    test('shows the batch alert, the stat tiles and a card for each rule, those with a waiting batch first', async ({ adminPage: page }) => {
      await page.goto('/admin/cleanup');
      await expect(page.getByTestId('admin-cleanup-page')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      await expect(page.getByTestId('admin-cleanup-new-rule')).toBeVisible();
      await expect(page.getByTestId('admin-cleanup-pause')).toBeVisible();
      await expect(page.getByTestId('admin-cleanup-tab-leaving-soon-count')).toHaveText(/^\d[\d,]*$/);
      await expect(page.getByTestId('admin-cleanup-alert-batch')).toContainText('wait for your approval');
      await expect(page.getByTestId('admin-cleanup-alert-batch')).toContainText('Nothing is deleted until you approve.');
      await expect(page.getByTestId('admin-cleanup-alert-batch-review')).toHaveAttribute('href', '/admin/cleanup?tab=leaving-soon');
      await expect(page.getByTestId('admin-cleanup-stats')).toContainText('In Leaving soon');
      await expect(page.getByTestId('admin-cleanup-stats')).toContainText('Waiting for you');
      await expect(page.getByRole('heading', { level: 2, name: 'Rules' })).toBeVisible();
      await expect(page.getByText('4 rules. A title that two rules match is in Leaving soon once, with the longer grace period.')).toBeVisible();

      const cards = page.getByTestId('admin-cleanup-rules').locator('[data-slot="card"]');
      // The three live rules have a waiting batch: they come first, by name
      await expect(cards).toHaveCount(4);
      expect(await cards.evaluateAll((els) => els.map((el) => el.getAttribute('data-testid')))).toEqual([
        `admin-cleanup-rule-${IDS.rules.shows}`,
        `admin-cleanup-rule-${IDS.rules.review}`,
        `admin-cleanup-rule-${IDS.rules.seasons}`,
        `admin-cleanup-rule-${IDS.rules.dry}`,
      ]);

      await shoot(page, 'rules-normal');
    });

    test('shows each mode with its badge, next step and facts', async ({ adminPage: page }) => {
      await page.goto('/admin/cleanup');
      await expect(card(page, IDS.rules.dry)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      const dry = `admin-cleanup-rule-${IDS.rules.dry}`;
      await expect(page.getByTestId(`${dry}-mode`)).toHaveText('Dry run');
      await expect(page.getByTestId(`${dry}-turn-on`)).toHaveText('Turn on...');
      await expect(page.getByTestId(`${dry}-review`)).toHaveCount(0);
      await expect(card(page, IDS.rules.dry)).toContainText('Dry runs');
      await expect(card(page, IDS.rules.dry)).toContainText('Members see');
      await expect(card(page, IDS.rules.dry)).toContainText('A dry run changes nothing');
      await expect(page.getByTestId(`${dry}-edit`)).toHaveAttribute('href', `/admin/cleanup/rules/${IDS.rules.dry}`);

      const review = `admin-cleanup-rule-${IDS.rules.review}`;
      await expect(page.getByTestId(`${review}-mode`)).toHaveText('Review first');
      await expect(page.getByTestId(`${review}-review`)).toHaveAttribute('href', '/admin/cleanup?tab=leaving-soon');
      await expect(page.getByTestId(`${review}-turn-on`)).toHaveCount(0);
      await expect(card(page, IDS.rules.review)).toContainText('Waiting for you');
      await expect(card(page, IDS.rules.review)).toContainText('In Leaving soon');

      const seasons = `admin-cleanup-rule-${IDS.rules.seasons}`;
      await expect(page.getByTestId(`${seasons}-mode`)).toHaveText('Automatic');
      await expect(card(page, IDS.rules.seasons)).toContainText('Deleted');
      await expect(card(page, IDS.rules.seasons)).toContainText('seasons');
      await expect(page.getByTestId(`${seasons}-turn-on`)).toHaveCount(0);
    });

    test('the menu holds the actions of each mode', async ({ adminPage: page }) => {
      await page.goto('/admin/cleanup');
      const seasons = `admin-cleanup-rule-${IDS.rules.seasons}`;
      const menu = page.getByTestId(`${seasons}-menu`);
      await expect(async () => {
        await menu.click();
        await expect(page.getByTestId(`${seasons}-menu-duplicate`)).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      for (const item of ['dry-run', 'duplicate', 'change-mode', 'review-first', 'dry-run-mode', 'delete']) {
        await expect(page.getByTestId(`${seasons}-menu-${item}`)).toBeVisible();
      }
      await expect(page.getByTestId(`${seasons}-menu-change-mode`)).toHaveAttribute('href', `/admin/cleanup/rules/${IDS.rules.seasons}/turn-on`);
      await page.keyboard.press('Escape');

      const dry = `admin-cleanup-rule-${IDS.rules.dry}`;
      await page.getByTestId(`${dry}-menu`).click();
      await expect(page.getByTestId(`${dry}-menu-duplicate`)).toBeVisible();
      for (const item of ['change-mode', 'review-first', 'dry-run-mode']) await expect(page.getByTestId(`${dry}-menu-${item}`)).toHaveCount(0);
      await page.keyboard.press('Escape');
    });

    test('Duplicate adds a copy in Dry run', async ({ adminPage: page }) => {
      await page.goto('/admin/cleanup');
      const cards = page.getByTestId('admin-cleanup-rules').locator('[data-slot="card"]');
      await expect(cards).toHaveCount(4, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      const review = `admin-cleanup-rule-${IDS.rules.review}`;
      await expect(async () => {
        await page.getByTestId(`${review}-menu`).click();
        await expect(page.getByTestId(`${review}-menu-duplicate`)).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await page.getByTestId(`${review}-menu-duplicate`).click();

      await expect(page.getByTestId('toast').filter({ hasText: 'Rule duplicated' })).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
      await expect(cards).toHaveCount(5, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      // By its heading: the overlap footer of the original names the copy too
      const copy = cards.filter({ has: page.getByRole('heading', { level: 3, name: 'Old movies to review copy', exact: true }) });
      await expect(copy.locator('[data-testid$="-mode"]')).toHaveText('Dry run');
    });

    test('Delete rule... asks first, then removes the card', async ({ adminPage: page }) => {
      await page.goto('/admin/cleanup');
      const dry = `admin-cleanup-rule-${IDS.rules.dry}`;
      await expect(async () => {
        await page.getByTestId(`${dry}-menu`).click();
        await expect(page.getByTestId(`${dry}-menu-delete`)).toBeVisible({ timeout: 1000 });
      }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await page.getByTestId(`${dry}-menu-delete`).click();

      const dialog = page.getByTestId('admin-cleanup-delete-rule-dialog');
      await expect(dialog).toContainText('Delete the rule Movies nobody played in two years?');
      await page.getByTestId('admin-cleanup-delete-rule-confirm').click();
      await expect(dialog).toHaveCount(0, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(card(page, IDS.rules.dry)).toHaveCount(0, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(page.getByText('3 rules. A title that two rules match is in Leaving soon once, with the longer grace period.')).toBeVisible();
    });

    test('the batch alert opens the Leaving soon tab @needs-leaving', async ({ adminPage: page }) => {
      await page.goto('/admin/cleanup');
      const review = page.getByTestId('admin-cleanup-alert-batch-review');
      await expect(review).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await review.click();

      await expect(page).toHaveURL(/\/admin\/cleanup\?tab=leaving-soon$/, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await expect(page.getByTestId('admin-cleanup-tab-leaving-soon')).toHaveAttribute('aria-selected', 'true');
      await expect(page.getByTestId(`admin-cleanup-batch-${IDS.batches.review}`)).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    });

    // Last: its dry run job writes the rule's dry run result (TS 16.4)
    test('Run dry run now starts a dry run', async ({ adminPage: page }) => {
      test.skip(!process.env.REDIS_URL, 'Needs the job queue');
      await page.goto('/admin/cleanup');
      const dry = `admin-cleanup-rule-${IDS.rules.dry}`;
      await expect(async () => {
        await page.getByTestId(`${dry}-menu`).click();
        await expect(page.getByTestId(`${dry}-menu-dry-run`)).toBeEnabled({ timeout: 1000 });
      }).toPass({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
      await page.getByTestId(`${dry}-menu-dry-run`).click();

      await expect(page.getByTestId('toast').filter({ hasText: 'Dry run started' })).toBeVisible({ timeout: WAIT_TIMEOUTS.TOAST_APPEAR });
    });
  });
});
