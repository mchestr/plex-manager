import { test as base } from '@playwright/test';
import { test } from './fixtures/test-setup';
import { verifyPageUnauthorized } from './helpers/test-utils';

test.describe('Admin Protection - Unauthenticated Users', () => {
  // List of admin pages to check
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

  for (const pagePath of adminPages) {
    base(`should show 401 error for unauthenticated user on ${pagePath}`, async ({ page }) => {
      // Navigate to the admin page without authentication
      await page.goto(pagePath);

      // Wait for page to load
      await page.waitForLoadState('networkidle');

      // Should see 401 unauthorized error
      await verifyPageUnauthorized(page);
    });
  }
});

test.describe('Admin Protection - Regular Users', () => {
  // List of admin pages to check
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

  for (const pagePath of adminPages) {
    test(`regular user should not access ${pagePath}`, async ({ regularUserPage }) => {
      // Navigate to the admin page as a regular user
      await regularUserPage.goto(pagePath);

      // Wait for page to load
      await regularUserPage.waitForLoadState('networkidle');

      // Should see 401 error or be denied access
      await verifyPageUnauthorized(regularUserPage);
    });
  }
});

