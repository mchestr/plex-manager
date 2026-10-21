import { expect, test } from './fixtures/auth';
import { signInAs } from './fixtures/session';
import { createE2EPrismaClient } from './helpers/prisma';
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
    // Scoped to the rows: the admin sidebar shows the signed-in admin's name too
    const adminRow = adminPage.getByTestId('user-row-admin-user-id');
    const regularRow = adminPage.getByTestId('user-row-regular-user-id');
    await expect(adminRow).toContainText('Admin User', { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(adminRow).toContainText('admin@example.com');
    await expect(regularRow).toContainText('Regular User');
    await expect(regularRow).toContainText('regular@example.com');
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

  test('should toggle Jellyfin login visibility in settings', async ({ adminPage }) => {
    // Navigate to settings
    await adminPage.locator('aside').getByTestId('admin-nav-settings').first().click();
    await waitForAdminContent(adminPage, [
      { type: 'heading', value: 'Settings' }
    ], { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });

    // Look for the Jellyfin login toggle - it should only be visible if Jellyfin is configured
    const jellyfinToggle = adminPage.getByTestId('jellyfin-login-toggle');

    // If Jellyfin is configured, test the toggle functionality
    if (await jellyfinToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Get current button text
      const buttonText = await jellyfinToggle.textContent();

      // Click the toggle
      await jellyfinToggle.click();

      // Wait for the toggle to update (button text should change)
      await expect(jellyfinToggle).not.toHaveText(buttonText!, { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });

      // Click again to restore original state
      await jellyfinToggle.click();

      // Verify it changed back
      await expect(jellyfinToggle).toHaveText(buttonText!, { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    }
  });

  // P4.7 (SEC-10): disabling a member ends their session at the next recheck.
  // A member of its own, so the shared seeded users stay enabled.
  test('disabling a member signs them out on their next navigation', async ({ adminPage, browser, baseURL }) => {
    const memberId = `p47-disabled-member-${Date.now()}`;
    const prisma = createE2EPrismaClient();
    await prisma.user.create({
      data: {
        id: memberId,
        name: 'Disabled Member',
        email: `${memberId}@example.com`,
        primaryAuthService: 'plex',
        onboardingStatus: { plex: true, jellyfin: false },
      },
    });

    // A first request refreshes the cookie's `checkedAt`, so the session that
    // proves the minted cookie works is a separate one.
    const probeContext = await browser.newContext();
    const memberContext = await browser.newContext();
    try {
      await signInAs(probeContext, baseURL!, memberId);
      const probe = await probeContext.request.get('/api/auth/session');
      expect(await probe.json()).toMatchObject({ user: { id: memberId } });

      // The member's minted session has a stale `checkedAt`, so their next
      // navigation rechecks the row.
      await signInAs(memberContext, baseURL!, memberId);
      const memberPage = await memberContext.newPage();

      await adminPage.goto(`/admin/users/${memberId}`);
      await waitForAdminPageReady(adminPage);
      await expect(adminPage.getByTestId('admin-user-disable-button')).toHaveCount(1);
      await adminPage.getByTestId('admin-user-disable-button').click();
      await adminPage.getByTestId('admin-user-disable-confirm').click();
      await expect(adminPage.getByTestId('admin-user-disabled-badge')).toBeVisible({
        timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION,
      });

      await memberPage.goto('/');
      await expect(memberPage.getByTestId('sign-in-button')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
      const session = await memberPage.request.get('/api/auth/session');
      expect(await session.json()).toEqual({});
    } finally {
      await probeContext.close();
      await memberContext.close();
      await prisma.user.delete({ where: { id: memberId } });
      await prisma.$disconnect();
    }
  });
});
