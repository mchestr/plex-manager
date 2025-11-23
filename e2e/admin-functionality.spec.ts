import { expect, test } from './fixtures/auth';
import { navigateAndVerify, verifyPageAccessible, waitForAdminPageReady } from './helpers/test-utils';

test.describe('Admin Functionality', () => {
  test('should access admin dashboard', async ({ adminPage }) => {
    // Navigate directly to /admin/users (the actual admin dashboard)
    await adminPage.goto('/admin/users', { waitUntil: 'networkidle', timeout: 20000 });
    await waitForAdminPageReady(adminPage, 20000);
    await expect(adminPage.getByRole('heading', { name: /Users/i })).toBeVisible({ timeout: 15000 });
  });

  test('should access admin settings', async ({ adminPage }) => {
    await navigateAndVerify(adminPage, '/admin/settings', { timeout: 20000 });
    await waitForAdminPageReady(adminPage, 20000);
    // Use exact match to avoid multiple heading matches
    await expect(adminPage.getByRole('heading', { name: 'Settings', exact: true }).first()).toBeVisible({ timeout: 15000 });
    // Check for specific settings form elements
    await expect(adminPage.getByText('Application Settings')).toBeVisible({ timeout: 10000 });
    await expect(adminPage.getByText('LLM Configuration')).toBeVisible({ timeout: 10000 });
  });

  test('should access admin users list', async ({ adminPage }) => {
    await navigateAndVerify(adminPage, '/admin/users', { timeout: 20000 });
    await waitForAdminPageReady(adminPage, 20000);
    await expect(adminPage.getByRole('heading', { name: 'Users' })).toBeVisible({ timeout: 15000 });
    // Should see the admin user we seeded
    await expect(adminPage.getByText('Admin User')).toBeVisible({ timeout: 10000 });
    await expect(adminPage.getByText('admin@example.com')).toBeVisible({ timeout: 10000 });
    // And the regular user we seeded
    await expect(adminPage.getByText('Regular User')).toBeVisible({ timeout: 10000 });
    await expect(adminPage.getByText('regular@example.com')).toBeVisible({ timeout: 10000 });
  });

  test('should access admin cost analysis', async ({ adminPage }) => {
    await navigateAndVerify(adminPage, '/admin/cost-analysis', { timeout: 20000 });
    await waitForAdminPageReady(adminPage, 20000);
    await expect(adminPage.getByRole('heading', { name: 'Cost Analysis' })).toBeVisible({ timeout: 15000 });
  });

  test('should access admin LLM usage', async ({ adminPage }) => {
    await navigateAndVerify(adminPage, '/admin/llm-usage', { timeout: 20000 });
    await waitForAdminPageReady(adminPage, 20000);
    await verifyPageAccessible(adminPage);
  });

  test('should access admin playground', async ({ adminPage }) => {
    await navigateAndVerify(adminPage, '/admin/playground', { timeout: 20000 });
    await waitForAdminPageReady(adminPage, 20000);
    await verifyPageAccessible(adminPage);
  });

  test('should access admin invites', async ({ adminPage }) => {
    await navigateAndVerify(adminPage, '/admin/invites', { timeout: 20000 });
    await waitForAdminPageReady(adminPage, 20000);
    await verifyPageAccessible(adminPage);
  });

  test('should access admin shares', async ({ adminPage }) => {
    await navigateAndVerify(adminPage, '/admin/shares', { timeout: 20000 });
    await waitForAdminPageReady(adminPage, 20000);
    await verifyPageAccessible(adminPage);
  });
});
