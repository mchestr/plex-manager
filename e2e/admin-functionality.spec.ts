import { expect, test } from './fixtures/auth';
import { verifyPageAccessible, waitForAdminContent, waitForAdminPageReady } from './helpers/test-utils';

// Mobile viewport for mobile-specific tests
const MOBILE_VIEWPORT = { width: 375, height: 667 };

test.describe('Admin Functionality', () => {
  test('should access admin dashboard', async ({ adminPage }) => {
    // After authentication, adminPage starts on /admin/users (dashboard)
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
    // Already on /admin/users; verify heading first
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

test.describe('Mobile Navigation', () => {
  test.beforeEach(async ({ adminPage }) => {
    // Set mobile viewport
    await adminPage.setViewportSize(MOBILE_VIEWPORT);
    // Navigate to admin and wait for page to load
    await adminPage.goto('/admin');
    await waitForAdminPageReady(adminPage, 30000);
  });

  test('should show mobile bottom navigation on mobile viewport', async ({ adminPage }) => {
    // Mobile navigation should be visible
    const mobileNav = adminPage.locator('nav.md\\:hidden');
    await expect(mobileNav).toBeVisible();

    // Desktop sidebar should be hidden
    const desktopSidebar = adminPage.locator('aside');
    await expect(desktopSidebar).not.toBeVisible();
  });

  test('should show primary nav items in mobile bottom bar', async ({ adminPage }) => {
    // Primary items should be visible in bottom bar
    await expect(adminPage.getByTestId('admin-nav-users-mobile')).toBeVisible();
    await expect(adminPage.getByTestId('admin-nav-invites-mobile')).toBeVisible();
    await expect(adminPage.getByTestId('admin-nav-maintenance-overview-mobile')).toBeVisible();
    await expect(adminPage.getByTestId('admin-nav-settings-mobile')).toBeVisible();
    await expect(adminPage.getByTestId('admin-nav-more-mobile')).toBeVisible();
  });

  test('should open More menu when More button is clicked', async ({ adminPage }) => {
    const moreButton = adminPage.getByTestId('admin-nav-more-mobile');

    // More menu should not be visible initially
    await expect(adminPage.locator('#mobile-more-menu')).not.toBeVisible();
    await expect(moreButton).toHaveAttribute('aria-expanded', 'false');

    // Click the More button
    await moreButton.click();

    // More menu should now be visible
    await expect(adminPage.locator('#mobile-more-menu')).toBeVisible();
    await expect(moreButton).toHaveAttribute('aria-expanded', 'true');
  });

  test('should show secondary nav items in More menu', async ({ adminPage }) => {
    // Open the More menu
    await adminPage.getByTestId('admin-nav-more-mobile').click();

    // Secondary items should be visible in the More menu
    await expect(adminPage.getByTestId('admin-nav-share-analytics-mobile')).toBeVisible();
    await expect(adminPage.getByTestId('admin-nav-maintenance-rules-mobile')).toBeVisible();
    await expect(adminPage.getByTestId('admin-nav-llm-usage-mobile')).toBeVisible();
    await expect(adminPage.getByTestId('admin-nav-cost-analysis-mobile')).toBeVisible();
    await expect(adminPage.getByTestId('admin-nav-prompts-mobile')).toBeVisible();
    await expect(adminPage.getByTestId('admin-nav-playground-mobile')).toBeVisible();
    await expect(adminPage.getByTestId('admin-nav-home-mobile')).toBeVisible();
    await expect(adminPage.getByTestId('admin-nav-signout-mobile')).toBeVisible();
  });

  test('should close More menu when clicking a secondary nav item', async ({ adminPage }) => {
    // Open the More menu
    await adminPage.getByTestId('admin-nav-more-mobile').click();
    await expect(adminPage.locator('#mobile-more-menu')).toBeVisible();

    // Click a secondary nav item
    await adminPage.getByTestId('admin-nav-share-analytics-mobile').click();

    // Wait for navigation
    await adminPage.waitForURL('**/admin/shares');

    // More menu should be closed after navigation
    await expect(adminPage.locator('#mobile-more-menu')).not.toBeVisible();
  });

  test('should close More menu when More button is clicked again', async ({ adminPage }) => {
    const moreButton = adminPage.getByTestId('admin-nav-more-mobile');

    // Open the More menu
    await moreButton.click();
    await expect(adminPage.locator('#mobile-more-menu')).toBeVisible();

    // Click the More button again to close
    await moreButton.click();
    await expect(adminPage.locator('#mobile-more-menu')).not.toBeVisible();
  });

  test('should navigate using primary mobile nav items', async ({ adminPage }) => {
    // Click Invites in the bottom bar
    await adminPage.getByTestId('admin-nav-invites-mobile').click();
    await adminPage.waitForURL('**/admin/invites');
    await waitForAdminPageReady(adminPage, 15000);

    // Click Settings in the bottom bar
    await adminPage.getByTestId('admin-nav-settings-mobile').click();
    await adminPage.waitForURL('**/admin/settings');
    await waitForAdminPageReady(adminPage, 15000);
  });

  test('should have proper ARIA attributes on More button', async ({ adminPage }) => {
    const moreButton = adminPage.getByTestId('admin-nav-more-mobile');

    // Verify ARIA attributes
    await expect(moreButton).toHaveAttribute('aria-haspopup', 'true');
    await expect(moreButton).toHaveAttribute('aria-label', 'More navigation options');
    await expect(moreButton).toHaveAttribute('aria-controls', 'mobile-more-menu');
    await expect(moreButton).toHaveAttribute('aria-expanded', 'false');

    // Open menu and verify aria-expanded changes
    await moreButton.click();
    await expect(moreButton).toHaveAttribute('aria-expanded', 'true');
  });

  test('should have proper ARIA attributes on More menu', async ({ adminPage }) => {
    // Open the More menu
    await adminPage.getByTestId('admin-nav-more-mobile').click();

    const moreMenu = adminPage.locator('#mobile-more-menu');
    await expect(moreMenu).toHaveAttribute('role', 'menu');
    await expect(moreMenu).toHaveAttribute('aria-label', 'Additional navigation options');

    // Menu items should have menuitem role
    await expect(adminPage.getByTestId('admin-nav-share-analytics-mobile')).toHaveAttribute('role', 'menuitem');
    await expect(adminPage.getByTestId('admin-nav-home-mobile')).toHaveAttribute('role', 'menuitem');
    await expect(adminPage.getByTestId('admin-nav-signout-mobile')).toHaveAttribute('role', 'menuitem');
  });

  test('should highlight More button when secondary item is active', async ({ adminPage }) => {
    // Navigate to a secondary page (LLM Usage) via the More menu
    await adminPage.getByTestId('admin-nav-more-mobile').click();
    await adminPage.getByTestId('admin-nav-llm-usage-mobile').click();
    await adminPage.waitForURL('**/admin/llm-usage');
    await waitForAdminPageReady(adminPage, 15000);

    // More button should have the active state color class
    const moreButton = adminPage.getByTestId('admin-nav-more-mobile');
    await expect(moreButton).toHaveClass(/text-cyan-400/);
  });
});
