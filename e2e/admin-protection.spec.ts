import { test as base, expect } from '@playwright/test';
import { test } from './fixtures/auth';

// app/admin/layout.tsx renders these screens itself (getAdminGate), so they
// appear in a production build too (BP-27).
const adminPages = [
  '/admin',
  '/admin/cost-analysis',
  '/admin/invites',
  '/admin/llm-usage',
  '/admin/playground',
  '/admin/settings',
  '/admin/shares',
  '/admin/users',
];

test.describe('Admin Protection - Unauthenticated Users', () => {
  for (const pagePath of adminPages) {
    base(`should show 401 error for unauthenticated user on ${pagePath}`, async ({ page }) => {
      await page.goto(pagePath);

      await expect(page.getByTestId('unauthenticated-error-page')).toBeVisible();
      await expect(page.getByTestId('unauthorized-error-page')).toHaveCount(0);
    });
  }
});

test.describe('Admin Protection - Regular Users', () => {
  for (const pagePath of adminPages) {
    test(`regular user should not access ${pagePath}`, async ({ regularUserPage }) => {
      await regularUserPage.goto(pagePath);

      await expect(regularUserPage.getByTestId('unauthorized-error-page')).toBeVisible();
      await expect(regularUserPage.getByTestId('unauthenticated-error-page')).toHaveCount(0);
    });
  }
});
