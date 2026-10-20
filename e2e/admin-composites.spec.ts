import { expect, test } from '@playwright/test';
import { axeFor } from './a11y/scan';

// The admin composites on /dev/ui (plan step P6.5, ui-design-system 5.5):
// the 120-play table sorts and pages through the URL, rows stack with their
// actions at 390px, and filtering to zero rows offers Clear filters.

const COMPOSITES = ['page-header', 'stat-tile', 'data-table', 'empty-state'] as const;

test.describe('admin composites on /dev/ui', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/ui');
    // Until React swaps in the streamed page, a hidden copy shares its test id.
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('dev-ui')).toHaveCount(1);
  });

  test('sorting and paging the 120-row table change the URL', async ({ page }) => {
    const plays = page.getByTestId('dev-ui-plays-table');
    await expect(page.getByTestId('dev-ui-plays-table-pagination-info')).toHaveText('Showing 1 to 25 of 120 plays');

    await page.getByTestId('dev-ui-plays-table-sort-title').click();
    await expect(page).toHaveURL(/[?&]sort=title(&|$)/);
    await expect(plays.getByRole('columnheader', { name: /Title/ })).toHaveAttribute('aria-sort', 'ascending');

    await page.getByTestId('dev-ui-plays-table-pagination-next').click();
    await expect(page).toHaveURL(/[?&]page=2(&|$)/);
    await expect(page).toHaveURL(/[?&]sort=title(&|$)/);
    await expect(page.getByTestId('dev-ui-plays-table-pagination-info')).toHaveText('Showing 26 to 50 of 120 plays');
  });

  test('the users table shows every member without a pager', async ({ page }) => {
    await expect(page.getByTestId('dev-ui-users-table-pagination-info')).toHaveText('Showing all 7 members');
    await expect(page.getByTestId('dev-ui-users-table-pagination-next')).toHaveCount(0);
    await expect(page.getByTestId('dev-ui-users-table-row-u1').getByRole('link', { name: 'Dana Whitfield' })).toBeVisible();
  });

  test('filtering to zero rows shows the filtered empty state, and Clear filters resets it', async ({ page }) => {
    await page.getByTestId('dev-ui-plays-filters-search').fill('no such title');
    await expect(page).toHaveURL(/[?&]q=no(\+|%20)such(\+|%20)title/);
    await expect(page.getByTestId('dev-ui-plays-filters-count')).toHaveText('0 of 120 plays');

    await page.getByTestId('dev-ui-plays-empty-clear').click();
    await expect(page).not.toHaveURL(/[?&]q=/);
    await expect(page.getByTestId('dev-ui-plays-table-pagination-info')).toHaveText('Showing 1 to 25 of 120 plays');
  });

  test('at 390px rows stack and keep their actions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const users = page.getByTestId('dev-ui-users-table');
    await expect(users.getByRole('table')).toHaveCount(0);
    await expect(page.getByTestId('dev-ui-users-table-list')).toBeVisible();

    await page.getByTestId('dev-ui-users-table-actions-u3').click();
    await expect(page.getByRole('menu')).toContainText('Sam Rivera');
    await page.keyboard.press('Escape');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  for (const composite of COMPOSITES) {
    test(`the ${composite} panel has no axe violations`, async ({ page }) => {
      const results = await axeFor(page).include(`[data-testid="dev-ui-${composite}"]`).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
