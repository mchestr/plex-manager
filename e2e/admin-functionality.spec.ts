import { expect, test } from './fixtures/auth';
import { verifyPageAccessible, waitForAdminContent, waitForAdminPageReady, WAIT_TIMEOUTS } from './helpers/test-utils';

test.describe('Admin Functionality', () => {
  test('should access admin dashboard', async ({ adminPage }) => {
    // After authentication, adminPage starts on /admin/users (dashboard)
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: /Users/i }
    ], { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
  });

  test('should access admin settings', async ({ adminPage }) => {
    // Use in-app navigation instead of forcing a new navigation
    await adminPage.locator('aside').getByTestId('admin-nav-settings').first().click();
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: 'Settings' },
      { type: 'text', value: 'Application Settings' },
      { type: 'text', value: 'LLM Configuration' }
    ], { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
  });

  test('should access admin users list', async ({ adminPage }) => {
    // Already on /admin/users; verify heading first
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: 'Users' }
    ], { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });

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
    ], { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
  });

  test('should access admin cost analysis', async ({ adminPage }) => {
    await adminPage.locator('aside').getByTestId('admin-nav-cost-analysis').first().click();
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: 'Cost Analysis' }
    ], { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
  });

  test('should access admin LLM usage', async ({ adminPage }) => {
    await adminPage.locator('aside').getByTestId('admin-nav-llm-usage').first().click();
    await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.EXTENDED_OPERATION);
    await verifyPageAccessible(adminPage);
    // Wait for page content to be visible (not just accessible)
    await expect(adminPage.locator('main')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
  });

  test('should access admin playground', async ({ adminPage }) => {
    await adminPage.locator('aside').getByTestId('admin-nav-playground').first().click();
    await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.EXTENDED_OPERATION);
    await verifyPageAccessible(adminPage);
    // Wait for page content to be visible (not just accessible)
    await expect(adminPage.locator('main')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
  });

  test('should access admin invites', async ({ adminPage }) => {
    await adminPage.locator('aside').getByTestId('admin-nav-invites').first().click();
    await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.EXTENDED_OPERATION);
    await verifyPageAccessible(adminPage);
    // Wait for page content to be visible (not just accessible)
    await expect(adminPage.locator('main')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
  });

  test('should access admin shares', async ({ adminPage }) => {
    await adminPage.locator('aside').getByTestId('admin-nav-share-analytics').first().click();
    await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.EXTENDED_OPERATION);
    await verifyPageAccessible(adminPage);
    // Wait for page content to be visible (not just accessible)
    await expect(adminPage.locator('main')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
  });
});
