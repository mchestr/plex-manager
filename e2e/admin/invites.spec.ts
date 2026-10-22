import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';

/**
 * The invites pages (P10.1): create a Plex invite through the dialog, find it
 * in the list, open its detail page with the pass preview, then delete it
 * through the confirm and land back on the list.
 */

const CODE = `E2EINV${Date.now().toString(36).toUpperCase()}`.replace(/[^A-Z2-9]/g, 'X').slice(0, 16);

test.describe('Admin invites', () => {
  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.invite.deleteMany({ where: { code: CODE } });
    } finally {
      await prisma.$disconnect();
    }
  });

  test('create, find, preview and delete a Plex invite', async ({ adminPage }) => {
    await adminPage.goto('/admin/invites');
    await expect(adminPage.getByTestId('admin-invites-header')).toBeVisible();

    // Create
    await adminPage.getByTestId('generate-invite-button').click();
    const dialog = adminPage.getByTestId('admin-invites-create-dialog');
    await expect(dialog).toBeVisible();
    await dialog.getByTestId('invite-code-input').fill(CODE);
    await dialog.getByTestId('invite-max-uses-input').fill('3');
    await dialog.getByTestId('create-invite-submit').click();
    await expect(dialog.getByTestId('create-invite-success-code')).toHaveText(CODE);
    await adminPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden();

    // Find it in the list
    await adminPage.goto(`/admin/invites?q=${CODE}`);
    const prisma = createE2EPrismaClient();
    const invite = await prisma.invite.findUniqueOrThrow({ where: { code: CODE }, select: { id: true } }).finally(() => prisma.$disconnect());
    const row = adminPage.getByTestId(`admin-invites-row-${invite.id}`);
    await expect(row).toBeVisible();
    await expect(row).toContainText('0 of 3');

    // Detail page and the pass preview
    await row.getByRole('link', { name: CODE }).click();
    await expect(adminPage.getByTestId('admin-invite-header')).toBeVisible();
    const pass = adminPage.getByTestId('admin-invite-preview').getByTestId('invite-pass');
    await expect(pass).toHaveAttribute('data-state', 'valid');
    await expect(pass.getByTestId('invite-pass-code')).toHaveText(CODE);
    await expect(pass.getByTestId('invite-pass-uses')).toHaveText('3 of 3');
    await expect(pass.getByTestId('invite-pass-preview-accept')).toBeDisabled();

    // Delete through the confirm
    await adminPage.getByTestId('admin-invite-delete-button').click();
    await expect(adminPage.getByTestId('admin-invites-delete-dialog')).toBeVisible();
    await adminPage.getByTestId('admin-invite-delete').click();
    await expect(adminPage).toHaveURL(/\/admin\/invites$/);
    await expect(adminPage.getByTestId('admin-invites-header')).toBeVisible();
    await expect(adminPage.getByTestId(`admin-invites-row-${invite.id}`)).toHaveCount(0);
  });
});
