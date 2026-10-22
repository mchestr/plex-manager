import { expect, test } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { navigateAndVerify, waitForLoadingGone, WAIT_TIMEOUTS } from './helpers/test-utils';

// A Jellyfin invite reads as unknown while no Jellyfin server is active (P10.26,
// UI-36), so the pass tests run with one. It is closed to sign-in, so `/` keeps
// its Plex-only member pass. The admin tests run without it.
const JELLYFIN_SERVER = {
  id: 'e2e-invite-jellyfin',
  name: 'E2E Jellyfin',
  url: 'http://127.0.0.1:9',
  apiKey: 'e2e-jellyfin-key',
  isActive: true,
  enabledForLogin: false,
};

async function addJellyfinServer() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.jellyfinServer.upsert({ where: { id: JELLYFIN_SERVER.id }, create: JELLYFIN_SERVER, update: JELLYFIN_SERVER });
  } finally {
    await prisma.$disconnect();
  }
}

async function removeJellyfinServer() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.jellyfinServer.deleteMany({ where: { id: JELLYFIN_SERVER.id } });
  } finally {
    await prisma.$disconnect();
  }
}

test.describe('Jellyfin Invite Flow', () => {
  test.describe('Public Invite Page', () => {
    test.beforeAll(addJellyfinServer);
    test.afterAll(removeJellyfinServer);

    test('shows invalid state for unknown Jellyfin invite code', async ({ page }) => {
      const inviteCode = 'JELLY-INVALID-CODE';
      await navigateAndVerify(page, `/invite/${inviteCode}`, {
        waitForSelector: 'h1, h2, [role="heading"]'
      });

      await expect(page.getByTestId('invalid-invite-heading')).toHaveText("We couldn't find that invite", {
        timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
      });
    });

    test('a Jellyfin invite reads as unknown while Jellyfin is off', async ({ page }) => {
      const prisma = createE2EPrismaClient();
      const inviteCode = `JOFF${Date.now()}`.substring(0, 8).toUpperCase();

      try {
        await prisma.jellyfinServer.update({ where: { id: JELLYFIN_SERVER.id }, data: { isActive: false } });
        await prisma.invite.create({ data: { code: inviteCode, serverType: 'JELLYFIN', maxUses: 1, useCount: 0 } });

        await page.goto(`/invite/${inviteCode}`);
        await expect(page.getByTestId('invalid-invite-heading')).toHaveText("We couldn't find that invite", {
          timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
        });
        await expect(page.getByTestId('jellyfin-invite-form')).toHaveCount(0);
      } finally {
        await prisma.jellyfinServer.update({ where: { id: JELLYFIN_SERVER.id }, data: { isActive: true } });
        await prisma.invite.deleteMany({ where: { code: inviteCode } });
        await prisma.$disconnect();
      }
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

        // Should show the valid invite heading and Jellyfin form, naming the Jellyfin server
        await expect(page.getByTestId('valid-invite-heading')).toHaveText(`You're invited to ${JELLYFIN_SERVER.name}`, {
          timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
        });
        await expect(page.getByTestId('invite-pass')).toHaveAttribute('data-state', 'valid');
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

        // The username error shows on the form, which stays usable
        await expect(page.getByTestId('jellyfin-form-error')).toContainText('letters, numbers, dots, dashes or underscores');
        await expect(page.getByTestId('jellyfin-invite-form')).toBeVisible();
        await expect(page.getByTestId('invalid-invite-heading')).toHaveCount(0);

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

        // The mismatch shows on the form, which stays usable
        await expect(page.getByTestId('jellyfin-form-error')).toHaveText('Passwords do not match');
        await expect(page.getByTestId('jellyfin-invite-form')).toBeVisible();
        await expect(page.getByTestId('invalid-invite-heading')).toHaveCount(0);

      } finally {
        await prisma.invite.deleteMany({
          where: { code: inviteCode }
        });
        await prisma.$disconnect();
      }
    });

    test('rejects an email-shaped username without consuming the invite', async ({ page }) => {
      const prisma = createE2EPrismaClient();
      const inviteCode = `JMAIL${Date.now()}`.substring(0, 8).toUpperCase();

      try {
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

        await page.getByTestId('jellyfin-username-input').fill('owner@example.com');
        await page.getByTestId('jellyfin-password-input').fill('password123');
        await page.getByTestId('jellyfin-confirm-password-input').fill('password123');
        await page.getByTestId('jellyfin-submit-button').click();

        // Rejected on the form, so the member can pick another name on the same page
        await expect(page.getByTestId('jellyfin-form-error')).toContainText('letters, numbers, dots, dashes or underscores');
        await expect(page.getByTestId('jellyfin-invite-form')).toBeVisible();
        await expect(page.getByTestId('invalid-invite-heading')).toHaveCount(0);
        await expect(page.getByTestId('jellyfin-username-input')).toHaveValue('owner@example.com');

        const invite = await prisma.invite.findUnique({ where: { code: inviteCode } });
        expect(invite?.useCount).toBe(0);

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
      await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-invites').first().click();
      await waitForLoadingGone(adminPage);

      await expect(adminPage.getByTestId('admin-invites-header')).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
      await expect(adminPage.getByTestId('generate-invite-button')).toBeVisible();
    });

    test('admin can open create invite modal', async ({ adminPage }) => {
      await adminPage.getByTestId('admin-sidebar').getByTestId('admin-nav-invites').first().click();
      await waitForLoadingGone(adminPage);

      await adminPage.getByTestId('generate-invite-button').click();

      const dialog = adminPage.getByTestId('admin-invites-create-dialog');
      await expect(dialog).toBeVisible({ timeout: WAIT_TIMEOUTS.DIALOG_APPEAR });
      await expect(dialog.getByTestId('invite-server-type-plex')).toBeVisible();
      await expect(dialog.getByTestId('create-invite-submit')).toBeVisible();
    });

    test('a Jellyfin invite shows in the list with its server', async ({ adminPage }) => {
      const prisma = createE2EPrismaClient();
      const inviteCode = `JADM${Date.now()}`.substring(0, 8).toUpperCase();

      try {
        const invite = await prisma.invite.create({
          data: { code: inviteCode, serverType: 'JELLYFIN', maxUses: 5, useCount: 0 },
        });

        await adminPage.goto(`/admin/invites?q=${inviteCode}`);
        await waitForLoadingGone(adminPage);

        const row = adminPage.getByTestId(`admin-invites-row-${invite.id}`);
        await expect(row).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
        await expect(row).toContainText(inviteCode);
        await expect(row).toContainText('Jellyfin');
        await expect(row).toContainText('0 of 5');
      } finally {
        await prisma.invite.deleteMany({ where: { code: inviteCode } });
        await prisma.$disconnect();
      }
    });

    test('the Server filter keeps Plex and Jellyfin invites apart', async ({ adminPage }) => {
      const prisma = createE2EPrismaClient();
      const stamp = `${Date.now()}`;
      const plexCode = `PLX${stamp}`.substring(0, 8).toUpperCase();
      const jellyfinCode = `JFN${stamp}`.substring(0, 8).toUpperCase();

      try {
        const plex = await prisma.invite.create({ data: { code: plexCode, serverType: 'PLEX', maxUses: 1 } });
        const jellyfin = await prisma.invite.create({ data: { code: jellyfinCode, serverType: 'JELLYFIN', maxUses: 1 } });

        await adminPage.goto('/admin/invites?server=jellyfin');
        await waitForLoadingGone(adminPage);
        await expect(adminPage.getByTestId(`admin-invites-row-${jellyfin.id}`)).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
        await expect(adminPage.getByTestId(`admin-invites-row-${plex.id}`)).toHaveCount(0);

        await adminPage.goto('/admin/invites?server=plex');
        await waitForLoadingGone(adminPage);
        await expect(adminPage.getByTestId(`admin-invites-row-${plex.id}`)).toBeVisible({ timeout: WAIT_TIMEOUTS.ADMIN_CONTENT });
        await expect(adminPage.getByTestId(`admin-invites-row-${jellyfin.id}`)).toHaveCount(0);
      } finally {
        await prisma.invite.deleteMany({ where: { code: { in: [plexCode, jellyfinCode] } } });
        await prisma.$disconnect();
      }
    });
  });

  test.describe('Invite Expiration and Usage', () => {
    test.beforeAll(addJellyfinServer);
    test.afterAll(removeJellyfinServer);

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

        // The voided pass with the expired headline
        await expect(page.getByTestId('invalid-invite-heading')).toHaveText('This invite has expired', {
          timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
        });
        await expect(page.getByTestId('invalid-invite-heading')).toHaveAttribute('data-state', 'expired');

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

        // The voided pass with the used-up headline
        await expect(page.getByTestId('invalid-invite-heading')).toHaveText('This invite has been used up', {
          timeout: WAIT_TIMEOUTS.PAGE_CONTENT,
        });
        await expect(page.getByTestId('invalid-invite-heading')).toHaveAttribute('data-state', 'used-up');

      } finally {
        await prisma.invite.deleteMany({
          where: { code: inviteCode }
        });
        await prisma.$disconnect();
      }
    });
  });
});
