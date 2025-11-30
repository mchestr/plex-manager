import { expect, test } from './fixtures/auth';
import { verifyPageAccessible, waitForAdminContent, waitForAdminPageReady } from './helpers/test-utils';

test.describe('Admin Functionality', () => {
  test('should access admin dashboard', async ({ adminPage }) => {
    // Admin lands on observability page, navigate to users
    await adminPage.locator('aside').getByTestId('admin-nav-users').first().click();
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: /Users/i }
    ], { timeout: 30000 });
  });

  test('should access admin settings', async ({ adminPage }) => {
    // Use in-app navigation instead of forcing a new navigation
    await adminPage.locator('aside').getByTestId('admin-nav-settings').first().click();
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: 'Settings' },
      { type: 'text', value: 'Application Settings' },
      { type: 'text', value: 'LLM Configuration' }
    ], { timeout: 30000 });
  });

  test('should access admin users list', async ({ adminPage }) => {
    // Navigate to users page
    await adminPage.locator('aside').getByTestId('admin-nav-users').first().click();
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: 'Users' }
    ], { timeout: 30000 });

    // The default filter is "Plex Access: Yes", which may filter out the admin user
    // Change filter to "All" to see all users including admin
    const plexAccessFilter = adminPage.getByTestId('users-filter-plex-access');
    await plexAccessFilter.click();

    // Wait for dropdown to open and click "All" option
    await adminPage.getByTestId('users-filter-plex-access-option-all').click();

    // Wait for filtered results to appear - should now show all users
    await waitForAdminContent(adminPage, [
      { type: 'text', value: 'Admin User' },
      { type: 'text', value: 'admin@example.com' },
      { type: 'text', value: 'Regular User' },
      { type: 'text', value: 'regular@example.com' }
    ], { timeout: 30000 });
  });

  test('should access admin cost analysis', async ({ adminPage }) => {
    await adminPage.locator('aside').getByTestId('admin-nav-cost-analysis').first().click();
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: 'Cost Analysis' }
    ], { timeout: 30000 });
  });

  test('should access admin LLM usage', async ({ adminPage }) => {
    await adminPage.locator('aside').getByTestId('admin-nav-llm-usage').first().click();
    await waitForAdminPageReady(adminPage, 30000);
    await verifyPageAccessible(adminPage);
    // Wait for page content to be visible (not just accessible)
    await expect(adminPage.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('should access admin playground', async ({ adminPage }) => {
    await adminPage.locator('aside').getByTestId('admin-nav-playground').first().click();
    await waitForAdminPageReady(adminPage, 30000);
    await verifyPageAccessible(adminPage);
    // Wait for page content to be visible (not just accessible)
    await expect(adminPage.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('should access admin invites', async ({ adminPage }) => {
    await adminPage.locator('aside').getByTestId('admin-nav-invites').first().click();
    await waitForAdminPageReady(adminPage, 30000);
    await verifyPageAccessible(adminPage);
    // Wait for page content to be visible (not just accessible)
    await expect(adminPage.locator('main')).toBeVisible({ timeout: 15000 });
  });

  test('should access admin shares', async ({ adminPage }) => {
    await adminPage.locator('aside').getByTestId('admin-nav-share-analytics').first().click();
    await waitForAdminPageReady(adminPage, 30000);
    await verifyPageAccessible(adminPage);
    // Wait for page content to be visible (not just accessible)
    await expect(adminPage.locator('main')).toBeVisible({ timeout: 15000 });
  });
});
