import { expect, test } from '@playwright/test';
import { axeFor } from './a11y/scan';

// The admin composites on /dev/ui (plan step P6.5, ui-design-system 5.5):
// the 120-play table sorts and pages through the URL, at 390px rows become
// cards in the same table and keep their actions, and filtering to zero rows
// offers Clear filters.

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

  test('at 390px rows become cards in the same table and keep their actions', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const users = page.getByTestId('dev-ui-users-table');
    await expect(users.getByRole('table')).toHaveCount(1);
    await expect(page.getByTestId('dev-ui-users-table-row-u3')).toHaveCSS('display', 'grid');
    await expect(page.getByTestId('dev-ui-users-table-column-name')).toBeHidden();
    // The headers leave with the cards, so the toolbar sorts and filters instead
    await expect(page.getByTestId('dev-ui-plays-table-sort-title')).toBeHidden();
    await expect(page.getByTestId('dev-ui-plays-filters-sort')).toBeVisible();
    await expect(page.getByTestId('dev-ui-plays-filters-filter-kind')).toBeHidden();
    await expect(page.getByTestId('dev-ui-plays-filters-filters-open')).toBeVisible();

    await page.getByTestId('dev-ui-users-table-actions-u3').click();
    await expect(page.getByRole('menu')).toContainText('Sam Rivera');
    await page.keyboard.press('Escape');

    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);

    // At 320px the tables still fit; the page's other specimens are not under test here
    await page.setViewportSize({ width: 320, height: 844 });
    for (const table of ['dev-ui-users-table', 'dev-ui-plays-table']) {
      // scrollWidth counts any toolbar, card or pager content that spills out of the table's root
      const fit = await page.getByTestId(table).evaluate((root) => {
        const scroll = root.querySelector<HTMLElement>('[data-testid$="-scroll"]');
        return { root: root.scrollWidth - root.clientWidth, scroll: scroll ? scroll.scrollWidth - scroll.clientWidth : null };
      });
      expect(fit, table).toEqual({ root: 0, scroll: 0 });
    }
  });

  test('at 390px every focus stop in the table panel is on screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('dev-ui-plays-filters-search').focus();
    for (let stop = 0; stop < 40; stop++) {
      await page.keyboard.press('Tab');
      const focus = await page.evaluate(() => {
        const element = document.activeElement;
        if (!element?.closest('[data-testid="dev-ui-data-table"]')) return null;
        const box = element.getBoundingClientRect();
        return { id: element.getAttribute('data-testid') ?? element.tagName, width: box.width, height: box.height };
      });
      if (!focus) break;
      expect(focus.width, `${focus.id} is drawn`).toBeGreaterThan(1);
      expect(focus.height, `${focus.id} is drawn`).toBeGreaterThan(1);
    }
  });

  test('the tables and their FilterBar have no axe violations as cards at 390px', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByTestId('dev-ui-users-table-row-u3')).toHaveCSS('display', 'grid');
    const results = await axeFor(page)
      .include('[data-testid="dev-ui-users-table"]')
      .include('[data-testid="dev-ui-plays-filters"]')
      .include('[data-testid="dev-ui-plays-table-scroll"]')
      .analyze();
    expect(results.violations).toEqual([]);
  });

  for (const composite of COMPOSITES) {
    test(`the ${composite} panel has no axe violations`, async ({ page }) => {
      const results = await axeFor(page).include(`[data-testid="dev-ui-${composite}"]`).analyze();
      expect(results.violations).toEqual([]);
    });
  }
});
