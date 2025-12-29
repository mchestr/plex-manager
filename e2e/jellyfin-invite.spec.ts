import { expect, test } from './fixtures/test-setup';
import { createE2EPrismaClient } from './helpers/prisma';
import { navigateAndVerify, waitForLoadingGone, WAIT_TIMEOUTS } from './helpers/test-utils';

test.describe('Jellyfin Invite Flow', () => {
  test.describe('Public Invite Page', () => {
    test('shows invalid state for unknown Jellyfin invite code', async ({ page }) => {
      const inviteCode = 'JELLY-INVALID-CODE';
      await navigateAndVerify(page, `/invite/${inviteCode}`, {
        waitForSelector: 'h1, h2, [role="heading"]'
      });

      await expect(page.getByTestId('invalid-invite-heading')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    });

    test('shows Jellyfin sign-in form for valid Jellyfin invite', async ({ page }) => {
      const prisma = createE2EPrismaClient();
      const inviteCode = `JELLY${Date.now()}`.substring(0, 8).toUpperCase();

      try {
        // Create a Jellyfin invite directly in the database
        await prisma.invite.create({
          data: {
            code: inviteCode,
            serverType: 'JELLYFIN',
            maxUses: 1,
            useCount: 0,
          }
        });

        // Navigate to the invite page
        await page.goto(`/invite/${inviteCode}`);
        await waitForLoadingGone(page);

        // Should show the valid invite heading and Jellyfin form
        await expect(page.getByTestId('valid-invite-heading')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
        await expect(page.getByTestId('jellyfin-invite-form')).toBeVisible();

        // Verify form fields are present
        await expect(page.getByTestId('jellyfin-username-input')).toBeVisible();
        await expect(page.getByTestId('jellyfin-password-input')).toBeVisible();
        await expect(page.getByTestId('jellyfin-confirm-password-input')).toBeVisible();
        await expect(page.getByTestId('jellyfin-submit-button')).toBeVisible();

      } finally {
        // Cleanup
        await prisma.invite.deleteMany({
          where: { code: inviteCode }
        });
        await prisma.$disconnect();
      }
    });

    test('validates form fields before submission', async ({ page }) => {
      const prisma = createE2EPrismaClient();
      const inviteCode = `JVAL${Date.now()}`.substring(0, 8).toUpperCase();

      try {
        // Create a Jellyfin invite
        await prisma.invite.create({
          data: {
            code: inviteCode,
            serverType: 'JELLYFIN',
            maxUses: 1,
            useCount: 0,
          }
        });

        await page.goto(`/invite/${inviteCode}`);
        await waitForLoadingGone(page);
        await expect(page.getByTestId('jellyfin-invite-form')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

        // Try to submit empty form
        await page.getByTestId('jellyfin-submit-button').click();

        // Should show error for missing username
        await expect(page.getByTestId('invalid-invite-heading')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

      } finally {
        await prisma.invite.deleteMany({
          where: { code: inviteCode }
        });
        await prisma.$disconnect();
      }
    });

    test('validates password confirmation matches', async ({ page }) => {
      const prisma = createE2EPrismaClient();
      const inviteCode = `JPWD${Date.now()}`.substring(0, 8).toUpperCase();

      try {
        // Create a Jellyfin invite
        await prisma.invite.create({
          data: {
            code: inviteCode,
            serverType: 'JELLYFIN',
            maxUses: 1,
            useCount: 0,
          }
        });

        await page.goto(`/invite/${inviteCode}`);
        await waitForLoadingGone(page);
        await expect(page.getByTestId('jellyfin-invite-form')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

        // Fill in mismatched passwords
        await page.getByTestId('jellyfin-username-input').fill('testuser');
        await page.getByTestId('jellyfin-password-input').fill('password123');
        await page.getByTestId('jellyfin-confirm-password-input').fill('differentpassword');
        await page.getByTestId('jellyfin-submit-button').click();

        // Should show error for password mismatch (shows as invalid invite due to error callback)
        await expect(page.getByTestId('invalid-invite-heading')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
        await expect(page.getByText('Passwords do not match')).toBeVisible();

      } finally {
        await prisma.invite.deleteMany({
          where: { code: inviteCode }
        });
        await prisma.$disconnect();
      }
    });
  });

  test.describe('Admin Invite Management', () => {
    test('admin can access invites page', async ({ adminPage }) => {
      await adminPage.locator('aside').getByTestId('admin-nav-invites').first().click();
      await waitForLoadingGone(adminPage);

      await expect(adminPage.getByRole('heading', { name: 'Invites', exact: true })).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
      await expect(adminPage.getByTestId('generate-invite-button')).toBeVisible();
    });

    test('admin can open create invite modal', async ({ adminPage }) => {
      await adminPage.locator('aside').getByTestId('admin-nav-invites').first().click();
      await waitForLoadingGone(adminPage);

      await adminPage.getByTestId('generate-invite-button').click();

      // Modal should appear
      await expect(adminPage.getByRole('dialog')).toBeVisible({ timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });
      await expect(adminPage.getByRole('heading', { name: 'Create Invite' })).toBeVisible();
    });

    test('admin can create a Jellyfin invite via database', async ({ adminPage }) => {
      const prisma = createE2EPrismaClient();
      const inviteCode = `JADM${Date.now()}`.substring(0, 8).toUpperCase();

      try {
        // Create a Jellyfin invite directly (simulating what the admin action does)
        const invite = await prisma.invite.create({
          data: {
            code: inviteCode,
            serverType: 'JELLYFIN',
            maxUses: 5,
            useCount: 0,
            allowDownloads: true,
          }
        });

        expect(invite.serverType).toBe('JELLYFIN');
        expect(invite.allowDownloads).toBe(true);
        expect(invite.maxUses).toBe(5);

        // Navigate to invites page and verify
        await adminPage.locator('aside').getByTestId('admin-nav-invites').first().click();
        await waitForLoadingGone(adminPage);

        // The invite should appear in the list
        await expect(adminPage.getByText(inviteCode)).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });

        // Check for Jellyfin badge (use first() for multiple matches)
        await expect(adminPage.getByText('Jellyfin').first()).toBeVisible();

      } finally {
        await prisma.invite.deleteMany({
          where: { code: inviteCode }
        });
        await prisma.$disconnect();
      }
    });

    test('invite list shows server type badges correctly', async ({ adminPage }) => {
      const prisma = createE2EPrismaClient();
      const plexCode = `PLX${Date.now()}`.substring(0, 8).toUpperCase();
      const jellyfinCode = `JFN${Date.now()}`.substring(0, 8).toUpperCase();

      try {
        // Create both Plex and Jellyfin invites
        await prisma.invite.createMany({
          data: [
            {
              code: plexCode,
              serverType: 'PLEX',
              maxUses: 1,
              useCount: 0,
            },
            {
              code: jellyfinCode,
              serverType: 'JELLYFIN',
              maxUses: 1,
              useCount: 0,
            }
          ]
        });

        // Navigate to invites page
        await adminPage.locator('aside').getByTestId('admin-nav-invites').first().click();
        await waitForLoadingGone(adminPage);

        // Both invites should appear with correct badges
        await expect(adminPage.getByText(plexCode)).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
        await expect(adminPage.getByText(jellyfinCode)).toBeVisible();

        // Should show both Plex and Jellyfin badges (at least one each)
        const plexBadges = adminPage.locator('span:has-text("Plex")');
        const jellyfinBadges = adminPage.locator('span:has-text("Jellyfin")');

        expect(await plexBadges.count()).toBeGreaterThanOrEqual(1);
        expect(await jellyfinBadges.count()).toBeGreaterThanOrEqual(1);

      } finally {
        await prisma.invite.deleteMany({
          where: { code: { in: [plexCode, jellyfinCode] } }
        });
        await prisma.$disconnect();
      }
    });
  });

  test.describe('Invite Expiration and Usage', () => {
    test('expired Jellyfin invite shows error', async ({ page }) => {
      const prisma = createE2EPrismaClient();
      const inviteCode = `JEXP${Date.now()}`.substring(0, 8).toUpperCase();

      try {
        // Create an expired invite
        await prisma.invite.create({
          data: {
            code: inviteCode,
            serverType: 'JELLYFIN',
            maxUses: 1,
            useCount: 0,
            expiresAt: new Date(Date.now() - 1000), // Expired 1 second ago
          }
        });

        await page.goto(`/invite/${inviteCode}`);
        await waitForLoadingGone(page);

        // Should show invalid/expired message
        await expect(page.getByTestId('invalid-invite-heading')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
        await expect(page.getByText(/expired/i)).toBeVisible();

      } finally {
        await prisma.invite.deleteMany({
          where: { code: inviteCode }
        });
        await prisma.$disconnect();
      }
    });

    test('fully used Jellyfin invite shows error', async ({ page }) => {
      const prisma = createE2EPrismaClient();
      const inviteCode = `JUSED${Date.now()}`.substring(0, 8).toUpperCase();

      try {
        // Create a fully used invite
        await prisma.invite.create({
          data: {
            code: inviteCode,
            serverType: 'JELLYFIN',
            maxUses: 1,
            useCount: 1, // Already used
          }
        });

        await page.goto(`/invite/${inviteCode}`);
        await waitForLoadingGone(page);

        // Should show invalid/used message
        await expect(page.getByTestId('invalid-invite-heading')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
        await expect(page.getByText(/maximum uses/i)).toBeVisible();

      } finally {
        await prisma.invite.deleteMany({
          where: { code: inviteCode }
        });
        await prisma.$disconnect();
      }
    });
  });
});
