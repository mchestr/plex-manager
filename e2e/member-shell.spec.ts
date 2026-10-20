import { expect, test } from './fixtures/auth';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * The member AppShell (P6.3, ui-design-system 6.1): the skip link reaches the
 * one `main#main`, the account menu works from the keyboard, and below `md`
 * the menu button opens a Sheet with the same links.
 */
test.describe('Member shell', () => {
  test('the skip link reaches main#main', async ({ regularUserPage: page }) => {
    await page.goto('/');
    await expect(page.getByTestId('app-top-bar')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(page.locator('main#main')).toHaveCount(1);

    await page.keyboard.press('Tab');
    await expect(page.getByTestId('skip-to-content')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('main#main')).toBeFocused();
  });

  test('Home is the current page, and the account menu works by keyboard', async ({ regularUserPage: page }) => {
    await page.goto('/');
    await expect(page.getByTestId('member-nav-home')).toHaveAttribute('aria-current', 'page');

    await page.getByTestId('account-menu-trigger').focus();
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('account-menu')).toBeVisible();
    await expect(page.getByTestId('sign-out-button')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('account-menu')).toBeHidden();
    await expect(page.getByTestId('account-menu-trigger')).toBeFocused();
  });

  test('below md the menu button opens the Sheet with the same links', async ({ regularUserPage: page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto('/');
    await expect(page.getByTestId('member-nav-home')).toBeHidden();

    await page.getByTestId('member-menu-button').click();
    const sheet = page.getByTestId('member-menu-sheet');
    await expect(sheet).toBeVisible();
    await expect(sheet.getByTestId('member-nav-home-mobile')).toHaveAttribute('aria-current', 'page');

    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  });
});
