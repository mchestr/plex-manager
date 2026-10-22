import type { Page } from '@playwright/test';
import { expect, test } from './fixtures/auth';
import { setLightThemeFlag as setFlag } from './helpers/light-theme';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * The light theme behind its flag (P10.10, ui-design-system 4.1): the admin
 * turns on "Light theme for members", a member picks Light on /account, and
 * the server renders light from the first byte (no `dark` class, the light
 * theme colour) after a reload. The account menu shows the choice, a Rewind
 * ink prints exactly as it does in dark, and turning the flag off puts the
 * member back on dark with the cookie still set.
 *
 * The admin flips the flag through the settings Switch, whose action
 * revalidates the cached app settings at once.
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
  test.describe.configure({ mode: 'serial' });

  test.afterAll(async () => {
    // Leave the flag off for later specs even when a test failed before the
    // last one turned it off (the app's settings cache may hold it up to a minute).
    const prisma = createE2EPrismaClient();
    try {
      await prisma.config.updateMany({ data: { lightThemeEnabled: false } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('with the flag off, /account has no Appearance and the menu offers none', async ({ adminPage, regularUserPage }) => {
    await setFlag(adminPage, false);

    await regularUserPage.goto('/account');
    await expect(regularUserPage.getByTestId('account-timezone-section')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(regularUserPage.getByTestId('account-appearance')).toHaveCount(0);
    await regularUserPage.getByTestId('account-menu-trigger').click();
    await expect(regularUserPage.getByTestId('account-menu')).toBeVisible();
    await expect(regularUserPage.getByTestId('account-menu-appearance')).toHaveCount(0);
  });

  test('a member picks Light on /account and the first paint is light', async ({ adminPage, regularUserPage: page }) => {
    await setFlag(adminPage, true);

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

  test('turning the flag off puts the member back on dark, cookie or not', async ({ adminPage, regularUserPage: page }) => {
    await setFlag(adminPage, true);
    await page.goto('/account');
    await page.getByTestId('account-appearance-picker-light').click();
    await expect.poll(() => isDark(page)).toBe(false);

    await setFlag(adminPage, false);
    await page.reload();
    await expect(page.getByTestId('account-timezone-section')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    expect(await isDark(page)).toBe(true);
    expect(await firstPaint(page, '/account')).toEqual({ dark: true, themeColor: '#1a1c1e' });
    await expect(page.getByTestId('account-appearance')).toHaveCount(0);
  });
});
