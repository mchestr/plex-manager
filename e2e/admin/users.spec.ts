import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';

/**
 * The users list (P10.18), the reference admin list page: with Plex at a
 * dead address every member is still listed as Unknown under the Plex-down
 * Alert, a filter change lands in the URL with a chip, and Make admin and
 * Disable run from a row's action menu through their confirms (UI-46).
 */

const MEMBER = { id: 'users-list-e2e-id', plexUserId: 'users-list-e2e-plex', name: 'Aaa Users Member', email: 'users-list@example.com' };
const DEAD_PLEX = 'http://127.0.0.1:9';

let plexUrl: { id: string; url: string } | null = null;

test.describe('Admin users list', () => {
  test.describe.configure({ mode: 'serial' });

  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      const row = { ...MEMBER, isAdmin: false, disabledAt: null, primaryAuthService: 'plex', onboardingStatus: { plex: true, jellyfin: false } };
      await prisma.user.upsert({ where: { id: MEMBER.id }, create: row, update: row });
      const server = await prisma.plexServer.findFirst({ where: { isActive: true }, select: { id: true, url: true } });
      if (server) {
        plexUrl = server;
        await prisma.plexServer.update({ where: { id: server.id }, data: { url: DEAD_PLEX } });
      }
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      if (plexUrl) await prisma.plexServer.update({ where: { id: plexUrl.id }, data: { url: plexUrl.url } });
      await prisma.user.deleteMany({ where: { id: MEMBER.id } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('lists every member as Unknown under the Plex-down Alert', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');

    await expect(adminPage.getByTestId('admin-users-plex-alert')).toContainText("Plex didn't respond");
    await expect(adminPage.getByTestId('admin-users-stats')).toBeVisible();
    await expect(adminPage.getByTestId(`admin-users-row-${MEMBER.id}`)).toBeVisible();
    await expect(adminPage.getByTestId(`admin-users-plex-${MEMBER.id}`)).toContainText('Unknown');
    await expect(adminPage.getByTestId('admin-users-pagination-info')).toContainText('Showing all');
  });

  test('a filter change updates the URL and shows a chip', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    await adminPage.getByTestId('admin-users-filters-filter-plexAccess').click();
    await adminPage.getByTestId('admin-users-filters-filter-plexAccess-option-unknown').click();

    await expect(adminPage).toHaveURL(/plexAccess=unknown/);
    await expect(adminPage.getByTestId('admin-users-filters-chip-plexAccess')).toContainText('Plex access: Unknown');
    await expect(adminPage.getByTestId(`admin-users-row-${MEMBER.id}`)).toBeVisible();
  });

  test('makes a member an admin through the row menu and its confirm', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    await adminPage.getByTestId(`admin-users-actions-${MEMBER.id}`).click();
    await adminPage.getByTestId(`admin-users-actions-${MEMBER.id}-role`).click();

    const dialog = adminPage.getByTestId('admin-user-role-dialog');
    await expect(dialog).toContainText(`Make ${MEMBER.name} an admin?`);
    await adminPage.getByTestId('admin-user-role-confirm').click();
    await expect(dialog).toBeHidden();

    const prisma = createE2EPrismaClient();
    try {
      await expect.poll(async () => (await prisma.user.findUniqueOrThrow({ where: { id: MEMBER.id } })).isAdmin).toBe(true);
    } finally {
      await prisma.$disconnect();
    }
    // The refreshed row now offers to take the role away
    await adminPage.getByTestId(`admin-users-actions-${MEMBER.id}`).click();
    await expect(adminPage.getByTestId(`admin-users-actions-${MEMBER.id}-role`)).toContainText('Remove admin role');
    await adminPage.keyboard.press('Escape');
  });

  test('disables a member through the row menu and its confirm', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    await adminPage.getByTestId(`admin-users-actions-${MEMBER.id}`).click();
    await adminPage.getByTestId('admin-user-disable-button').click();

    const dialog = adminPage.getByTestId('admin-user-disable-dialog');
    await expect(dialog).toContainText(`Disable ${MEMBER.name}'s account?`);
    await adminPage.getByTestId('admin-user-disable-confirm').click();
    await expect(dialog).toBeHidden();

    // The refreshed row now offers Enable instead
    await adminPage.getByTestId(`admin-users-actions-${MEMBER.id}`).click();
    await expect(adminPage.getByTestId('admin-user-disable-button')).toContainText('Enable account');
  });
});
