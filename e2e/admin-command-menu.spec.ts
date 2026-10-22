import { expect, test, TEST_USERS } from './fixtures/auth';
import { VISUAL_INVITES } from './helpers/seed-fixtures';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * The admin command menu (P10.16): Ctrl K opens it on any admin page, a
 * member's name finds their detail page, and an invite code finds its invite.
 */
let inviteId = '';
let createdInvite = false;

test.describe('Admin command menu', () => {
  test.beforeAll(async () => {
    const prisma = createE2EPrismaClient();
    createdInvite = !(await prisma.invite.findUnique({ where: { code: VISUAL_INVITES.valid } }));
    const invite = await prisma.invite.upsert({
      where: { code: VISUAL_INVITES.valid },
      create: { code: VISUAL_INVITES.valid, maxUses: 5, expiresAt: new Date('2099-01-01T00:00:00Z') },
      update: {},
    });
    inviteId = invite.id;
    await prisma.$disconnect();
  });

  test.afterAll(async () => {
    if (!createdInvite) return;
    const prisma = createE2EPrismaClient();
    await prisma.invite.deleteMany({ where: { id: inviteId } });
    await prisma.$disconnect();
  });

  test('Ctrl K, a member name and Enter open the member', async ({ adminPage: page }) => {
    await page.goto('/admin/invites');
    await expect(page.getByTestId('admin-command-trigger')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    // The server-rendered trigger shows before the shortcut's listener hydrates
    await page.waitForLoadState('networkidle');

    await page.keyboard.press('ControlOrMeta+k');
    const input = page.getByTestId('admin-command-input');
    await expect(input).toBeFocused();
    await input.fill('Regular');
    await expect(page.getByTestId(`admin-command-user-${TEST_USERS.REGULAR.id}`)).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('Enter');

    await expect(page).toHaveURL(new RegExp(`/admin/users/${TEST_USERS.REGULAR.id}$`));
    await expect(page.getByTestId('admin-command-menu')).toBeHidden();
  });

  test('the sidebar trigger finds the seeded invite code', async ({ adminPage: page }) => {
    await page.goto('/admin/users');
    await page.getByTestId('admin-command-trigger').click();

    await page.getByTestId('admin-command-input').fill(VISUAL_INVITES.valid.toLowerCase());
    const item = page.getByTestId(`admin-command-invite-${inviteId}`);
    await expect(item).toBeVisible();
    await item.click();

    await expect(page).toHaveURL(new RegExp(`/admin/invites/${inviteId}$`));
  });

  test('Escape closes the menu and returns focus to the trigger', async ({ adminPage: page }) => {
    await page.goto('/admin/users');
    const trigger = page.getByTestId('admin-command-trigger');
    await trigger.click();
    await expect(page.getByTestId('admin-command-menu')).toBeVisible();

    await page.keyboard.press('Escape');
    await expect(page.getByTestId('admin-command-menu')).toBeHidden();
    await expect(trigger).toBeFocused();
  });
});
