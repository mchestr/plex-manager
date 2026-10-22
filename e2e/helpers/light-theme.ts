import { expect, type Page } from '@playwright/test';

/**
 * The light theme's flag and cookie for the E2E specs (P10.10). The flag is
 * flipped through the admin settings Switch, whose action revalidates the
 * app's cached settings at once; a direct database write would wait out the
 * 60-second cache.
 */

/** The cookie `lib/design/theme.ts` reads. */
export const THEME_COOKIE = 'pm-theme';

/** A storage state that holds `pm-theme=light`, for the light projects. */
export function lightThemeStorageState(baseURL: string) {
  const { hostname } = new URL(baseURL);
  return {
    cookies: [
      {
        name: THEME_COOKIE,
        value: 'light',
        domain: hostname,
        path: '/',
        expires: -1,
        httpOnly: true,
        secure: false,
        sameSite: 'Lax' as const,
      },
    ],
    origins: [],
  };
}

/** Sets "Light theme for members" to `on` from `/admin/settings`; `page` must be an admin's. */
export async function setLightThemeFlag(page: Page, on: boolean): Promise<void> {
  await page.goto('/admin/settings');
  const toggle = page.getByTestId('settings-light-theme-switch');
  await expect(toggle).toBeVisible({ timeout: 15_000 });
  if ((await toggle.getAttribute('aria-checked')) !== String(on)) await toggle.click();
  await expect(toggle).toHaveAttribute('aria-checked', String(on));
  await expect(toggle).not.toHaveAttribute('aria-busy', 'true');
}
