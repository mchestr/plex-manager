import { expect, test } from './fixtures/auth';
import { signInAs } from './fixtures/session';
import { createE2EPrismaClient } from './helpers/prisma';
import { verifyPageAccessible, waitForAdminPageReady, WAIT_TIMEOUTS } from './helpers/test-utils';

test.describe('Admin Functionality', () => {
  test('should access admin dashboard', async ({ adminPage }) => {
    // After authentication, adminPage is on /admin, the Overview (P10.8)
    await expect(adminPage).toHaveURL(/\/admin$/);
    await expect(adminPage.getByTestId('admin-overview-header')).toContainText('Overview', {
      timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION,
    });
  });

  test('should access admin settings', async ({ adminPage }) => {
    // Use in-app navigation instead of forcing a new navigation
    await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-settings').first().click();
    // The P10.19 layout: a section nav and one section per area
    await expect(adminPage).toHaveURL(/\/admin\/settings$/, { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(adminPage.getByTestId('admin-settings-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(adminPage.getByTestId('settings-nav')).toBeVisible();
    await expect(adminPage.getByTestId('settings-plex-section')).toBeVisible();
    await adminPage.getByTestId('settings-nav-system').click();
    await expect(adminPage.getByTestId('settings-system-section')).toBeVisible();
    await adminPage.getByTestId('settings-nav-ai').click();
    await expect(adminPage.getByTestId('settings-ai-section')).toBeVisible();
  });

  test('should access admin users list', async ({ adminPage }) => {
    await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-users').first().click();
    await expect(adminPage.getByTestId('admin-users-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });

    // Every filter defaults to All (P10.18, UI-05), so both seeded users are listed.
    // Scoped to the rows: the admin sidebar shows the signed-in admin's name too
    const adminRow = adminPage.getByTestId('admin-users-row-admin-user-id');
    const regularRow = adminPage.getByTestId('admin-users-row-regular-user-id');
    await expect(adminRow).toContainText('Admin User', { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
    await expect(adminRow).toContainText('admin@example.com');
    await expect(regularRow).toContainText('Regular User');
    await expect(regularRow).toContainText('regular@example.com');
  });

  test('should access admin cost analysis', async ({ adminPage }) => {
    await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-cost-analysis').first().click();
    await expect(adminPage.getByTestId('admin-cost-analysis-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
  });

  test('should access admin LLM usage', async ({ adminPage }) => {
    await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-llm-usage').first().click();
    await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.EXTENDED_OPERATION);
    await verifyPageAccessible(adminPage);
    await expect(adminPage.getByTestId('admin-llm-usage-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
  });

  test('should access admin playground', async ({ adminPage }) => {
    await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-playground').first().click();
    await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.EXTENDED_OPERATION);
    await verifyPageAccessible(adminPage);
    await expect(adminPage.getByTestId('admin-rewind-playground-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
  });

  test('should access admin invites', async ({ adminPage }) => {
    await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-invites').first().click();
    await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.EXTENDED_OPERATION);
    await verifyPageAccessible(adminPage);
    await expect(adminPage.getByTestId('admin-invites-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
  });

  test('should access admin shares', async ({ adminPage }) => {
    await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-share-analytics').first().click();
    await waitForAdminPageReady(adminPage, WAIT_TIMEOUTS.EXTENDED_OPERATION);
    await verifyPageAccessible(adminPage);
    await expect(adminPage.getByTestId('admin-shares-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
  });

  test('should toggle Jellyfin login visibility in settings', async ({ adminPage }) => {
    // Navigate to settings
    await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-settings').first().click();
    await expect(adminPage.getByTestId('admin-settings-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });

    // Sonarr, Radarr and Jellyfin sit in the Media group
    await adminPage.getByTestId('settings-nav-other').click();

    // Look for the Jellyfin login toggle - it should only be visible if Jellyfin is configured
    const jellyfinToggle = adminPage.getByTestId('jellyfin-login-toggle');

    // If Jellyfin is configured, its row carries the switch, which saves at once
    if (await jellyfinToggle.isVisible({ timeout: 5000 }).catch(() => false)) {
      const checked = (await jellyfinToggle.getAttribute('aria-checked')) ?? 'false';

      await jellyfinToggle.click();
      await expect(jellyfinToggle).not.toHaveAttribute('aria-checked', checked, { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });

      // Restore the original state
      await jellyfinToggle.click();
      await expect(jellyfinToggle).toHaveAttribute('aria-checked', checked, { timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
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
      // Disable sits in the header's action menu, the users list's row menu (P10.18)
      await adminPage.getByTestId('admin-user-actions').click();
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
