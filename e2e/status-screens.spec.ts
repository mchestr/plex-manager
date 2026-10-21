import { test as base, expect } from '@playwright/test';
import { test } from './fixtures/auth';

/**
 * The status screens in a production build (P10.17): the branded 404, the
 * admin denials, and a thrown error that shows its digest and never its
 * message (SEC-20). The web server sets ENABLE_DEV_UI=1 for the throw route.
 */
base.skip(process.env.E2E_SERVER !== 'prod', 'Runs only against a production build: set E2E_SERVER=prod.');

base('a missing page returns 404 and shows the status screen', async ({ page }) => {
  const response = await page.goto('/visual-missing-page');

  expect(response?.status()).toBe(404);
  await expect(page.getByTestId('status-screen')).toBeVisible();
  await expect(page.getByTestId('status-screen-code')).toHaveText('404');
  await expect(page.getByTestId('not-found-home')).toHaveAttribute('href', '/');
});

base('a signed-out visitor on /admin sees the sign-in status screen', async ({ page }) => {
  await page.goto('/admin');

  await expect(page.getByTestId('unauthenticated-error-page')).toBeVisible();
  await expect(page.getByTestId('unauthenticated-error-page').getByTestId('status-screen')).toBeVisible();
  await expect(page.getByTestId('admin-denial-sign-in')).toBeVisible();
});

test('a member on /admin sees the admins-only status screen', async ({ regularUserPage }) => {
  await regularUserPage.goto('/admin');

  await expect(regularUserPage.getByTestId('unauthorized-error-page')).toBeVisible();
  await expect(regularUserPage.getByTestId('unauthorized-error-page').getByTestId('status-screen')).toBeVisible();
  await expect(regularUserPage.getByTestId('go-home-button')).toHaveAttribute('href', '/');
});

base('a thrown error shows a digest and never its message', async ({ page }) => {
  await page.goto('/dev/ui/throw');

  await expect(page.getByTestId('status-screen')).toBeVisible();
  await expect(page.getByTestId('status-screen-code')).toHaveText(/\S+/);
  await expect(page.getByTestId('error-retry')).toBeVisible();
  await expect(page.locator('body')).not.toContainText('db:5432');
  await expect(page.locator('body')).not.toContainText("Can't reach database server");
});
