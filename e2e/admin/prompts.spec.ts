import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';

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

test.describe('a v2 template', () => {
  /** Its own row: the visual seed's v2 templates exist only while the visual and axe specs run. */
  const V2_ID = 'e2e-prompt-v2';

  async function removeV2(): Promise<void> {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.promptTemplate.deleteMany({ where: { id: V2_ID } });
    } finally {
      await prisma.$disconnect();
    }
  }

  test.beforeAll(async () => {
    await removeV2();
    const prisma = createE2EPrismaClient();
    try {
      await prisma.promptTemplate.create({
        data: { id: V2_ID, name: 'E2E v2 template', kind: 'v2-full', template: 'Write the Rewind for {{userName}}.' },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(removeV2);

  test('opens read-only on its edit page', async ({ adminPage }) => {
    await adminPage.goto(`/admin/prompts/${V2_ID}/edit`);
    await expect(adminPage.getByTestId('admin-prompt-editor-v2-notice')).toBeVisible();
    await expect(adminPage.getByTestId('admin-prompt-editor-save')).toHaveCount(0);
  });
});
