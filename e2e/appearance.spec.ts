import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/auth';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * The light theme (P10.10, ui-design-system 4.1): any signed-in user, member
 * or admin, picks Light on /account (or in the menus), and the server renders
 * light from the first byte (no `dark` class, the light theme colour) after a
 * reload. Dark is the default with no cookie, the account menu shows the
 * choice, and a Rewind ink prints exactly as it does in dark.
 */

const isDark = (page: Page) => page.evaluate(() => document.documentElement.classList.contains('dark'));

/** The server's HTML for `path`, as the first paint gets it. */
async function firstPaint(page: Page, path: string) {
  const html = await (await page.request.get(path)).text();
  const htmlTag = /<html[^>]*>/.exec(html)?.[0] ?? '';
  const themeColor = /<meta name="theme-color" content="([^"]+)"/.exec(html)?.[1];
  return { dark: /class="[^"]*\bdark\b/.test(htmlTag), themeColor };
}

/** A Rewind scope with one marigold field, injected into the page: its ink and field colours. */
function rewindInk(page: Page) {
  return page.evaluate(() => {
    document.querySelector('[data-testid="appearance-rewind-fixture"]')?.remove();
    const root = document.createElement('div');
    root.dataset.theme = 'rewind';
    root.dataset.testid = 'appearance-rewind-fixture';
    root.innerHTML =
      '<section data-field="marigold" class="light"><span style="color: var(--foreground); background: var(--background)">Ink</span></section>';
    document.body.append(root);
    const style = getComputedStyle(root.querySelector('span')!);
    return { color: style.color, background: style.backgroundColor };
  });
}

test.describe('Light theme', () => {
  test('dark is the default with no cookie', async ({ regularUserPage: page }) => {
    await page.goto('/account');
    await expect(page.getByTestId('account-appearance-picker-dark')).toHaveAttribute('aria-checked', 'true', {
      timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
    });
    expect(await isDark(page)).toBe(true);
    expect(await firstPaint(page, '/account')).toEqual({ dark: true, themeColor: '#1a1c1e' });
  });

  test('a member picks Light on /account and the first paint is light', async ({ regularUserPage: page }) => {
    await page.goto('/account');
    const dark = await rewindInk(page);
    expect(await isDark(page)).toBe(true);

    await page.getByTestId('account-appearance-picker-light').click();
    await expect.poll(() => isDark(page)).toBe(false);

    await page.reload();
    await expect(page.getByTestId('account-appearance-picker-light')).toHaveAttribute('aria-checked', 'true', {
      timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
    });
    expect(await isDark(page)).toBe(false);
    expect(await firstPaint(page, '/account')).toEqual({ dark: false, themeColor: '#f9fafb' });

    // The account menu shows the same choice.
    await page.getByTestId('account-menu-trigger').click();
    await expect(page.getByTestId('account-menu-appearance-light')).toHaveAttribute('aria-checked', 'true');
    await page.keyboard.press('Escape');

    // Rewind prints in its own inks in either theme.
    expect(await rewindInk(page)).toEqual(dark);
  });

  test('a member switches back to Dark from the account menu', async ({ regularUserPage: page }) => {
    await page.goto('/account');
    await page.getByTestId('account-appearance-picker-light').click();
    await expect.poll(() => isDark(page)).toBe(false);

    await page.getByTestId('account-menu-trigger').click();
    await page.getByTestId('account-menu-appearance-dark').click();
    await expect.poll(() => isDark(page)).toBe(true);

    await page.reload();
    expect(await firstPaint(page, '/account')).toEqual({ dark: true, themeColor: '#1a1c1e' });
  });

  test('an admin picks Light from the admin menu', async ({ adminPage: page }) => {
    await page.goto('/admin');
    await page.getByTestId('admin-appearance-trigger').click();
    await page.getByTestId('admin-appearance-light').click();
    await expect.poll(() => isDark(page)).toBe(false);

    await page.reload();
    expect(await isDark(page)).toBe(false);
    expect(await firstPaint(page, '/admin')).toEqual({ dark: false, themeColor: '#f9fafb' });
  });
});
