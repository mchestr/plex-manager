import { expect, test } from '../fixtures/auth';

/**
 * P10.4: create a Rewind style guide, see it in the assembled prompt,
 * use it for Rewind through the confirm, and read "In use" on the list.
 */

test('a new style guide is previewed, activated and listed as in use', async ({ adminPage }) => {
  const name = `E2E style ${Date.now()}`;
  const text = 'Short sentences. Dry, warm, never breathless.';

  await adminPage.goto('/admin/prompts/new');
  await expect(adminPage.getByTestId('admin-prompt-new-heading')).toBeVisible();

  await adminPage.getByTestId('admin-prompt-editor-name').fill(name);
  await adminPage.getByTestId('admin-prompt-editor-style-guide').fill(text);
  await expect(adminPage.getByTestId('admin-prompt-editor-preview').locator('mark')).toContainText(text);
  await expect(adminPage.getByTestId('admin-prompt-editor-counter')).toContainText(`${text.length} of 1,200 characters`);

  await adminPage.getByTestId('admin-prompt-editor-save').click();
  await expect(adminPage.getByTestId('admin-prompt-detail-heading')).toContainText(name);

  await adminPage.getByTestId('admin-prompt-activate').click();
  await expect(adminPage.getByTestId('admin-prompt-activate-dialog')).toContainText(`Use ${name} for Rewind?`);
  await adminPage.getByTestId('admin-prompt-activate-confirm').click();
  await expect(adminPage.getByTestId('admin-prompt-activate-dialog')).toBeHidden();

  await adminPage.goto('/admin/prompts');
  const row = adminPage.getByTestId('admin-prompts').locator('[data-testid^="admin-prompts-row-"]', { hasText: name });
  await expect(row).toContainText('In use');
});

test('a v2 template opens read-only on its edit page', async ({ adminPage }) => {
  await adminPage.goto('/admin/prompts/visual-prompt-active/edit');
  await expect(adminPage.getByTestId('admin-prompt-editor-v2-notice')).toBeVisible();
  await expect(adminPage.getByTestId('admin-prompt-editor-save')).toHaveCount(0);
});
