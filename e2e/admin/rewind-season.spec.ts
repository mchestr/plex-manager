import { expect, test } from '../fixtures/auth';

/**
 * The season console (P7.8): the preflight rows and the member table render,
 * and Generate all opens a confirm that states the member count and the
 * cost estimate. Cancelling it queues nothing.
 */
test.describe('Rewind season console', () => {
  test('shows the preflight, the StatGrid and the members', async ({ adminPage }) => {
    await adminPage.goto('/admin/rewind');

    await expect(adminPage.getByTestId('admin-rewind-header')).toBeVisible();
    for (const id of ['redis', 'tautulli', 'overseerr', 'sonarr', 'llm']) {
      await expect(adminPage.getByTestId(`admin-rewind-preflight-${id}`)).toBeVisible();
    }
    await expect(adminPage.getByTestId('admin-rewind-stat-ready')).toBeVisible();
    await expect(adminPage.getByTestId('admin-rewind-members')).toBeVisible();
  });

  test('Generate all opens a confirm with the estimate', async ({ adminPage }) => {
    await adminPage.goto('/admin/rewind');

    await adminPage.getByTestId('admin-rewind-generate-all-button').click();
    const dialog = adminPage.getByTestId('admin-rewind-generate-all-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText(/member/);
    await expect(dialog).toContainText(/(Estimated AI cost|costs nothing)/);
    await expect(adminPage.getByTestId('admin-rewind-generate-all-confirm')).toBeEnabled();

    await adminPage.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('is reachable from the admin nav', async ({ adminPage }) => {
    await adminPage.goto('/admin/users');
    await adminPage.getByTestId('admin-nav-season').first().click();
    await expect(adminPage).toHaveURL(/\/admin\/rewind$/);
  });
});
