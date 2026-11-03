import type { Locator } from '@playwright/test';

import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * Settings, Assistant sources, Skills: add a skill source, open its Check
 * skills, then remove it through the Edit Sheet's confirm. The source is Off,
 * so nothing in the run reads GitHub for it: an Off row's Check skills shows
 * the off copy without calling `checkSkills`. `checkSkills` and the full-SHA
 * display are covered by the action and block unit tests, since the reader
 * calls `https://api.github.com` and `e2e/mocks` has no GitHub server.
 */

const NAME = 'E2E skills';

/**
 * Removes the spec's source before and after the run, so a failed run or a
 * retry never meets a leftover row: its unique name would refuse the next
 * Save, and an active source would make later admin chat specs read GitHub.
 */
async function removeSource() {
  const prisma = createE2EPrismaClient();
  try {
    await prisma.skillSource.deleteMany({ where: { name: NAME } });
  } finally {
    await prisma.$disconnect();
  }
}

/**
 * Clicks `trigger` until `sheet` shows. A trigger rendered on the server does
 * nothing until React hydrates it, as `editSection` allows for.
 */
async function openSheet(trigger: Locator, sheet: Locator) {
  await expect(async () => {
    if (await sheet.isVisible()) return;
    await trigger.click();
    await expect(sheet).toBeVisible({ timeout: 1000 });
  }).toPass();
}

test.describe('Settings: assistant skill sources', () => {
  test.beforeAll(removeSource);
  test.afterAll(removeSource);

  test('admin adds, checks and removes a skill source', async ({ adminPage }) => {
    // The hash reveals the AI group, which plain /admin/settings keeps hidden
    await adminPage.goto('/admin/settings#assistant');

    // Add a source pinned to a commit, and Off
    const addSheet = adminPage.getByTestId('settings-skill-add-sheet');
    await openSheet(adminPage.getByTestId('settings-skill-add-open'), addSheet);
    await addSheet.getByTestId('settings-skill-name').fill(NAME);
    await addSheet.getByTestId('settings-skill-repo').fill('octo/skills');
    await addSheet.getByTestId('settings-skill-ref').fill('a'.repeat(40));
    await addSheet.getByTestId('settings-skill-active').uncheck();
    await addSheet.getByTestId('settings-skill-save').click();
    await expect(addSheet).toBeHidden({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });

    // The saved toast sits bottom-right, where it can cover the row's buttons
    const toast = adminPage.getByTestId('toast');
    await expect(toast).toContainText('Skill source saved');
    await toast.getByTestId('toast-dismiss').click();
    await expect(toast).toHaveCount(0);

    const prisma = createE2EPrismaClient();
    const { id } = await prisma.skillSource
      .findUniqueOrThrow({ where: { name: NAME }, select: { id: true } })
      .finally(() => prisma.$disconnect());
    const row = adminPage.getByTestId(`settings-skill-${id}`);
    await expect(row).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    await expect(row.getByTestId('settings-skill-moving-ref')).toHaveCount(0);

    // Check skills on an Off source says so and reads nothing
    await row.getByTestId('settings-skill-check').click();
    const dialog = adminPage.getByTestId('settings-skill-check-dialog');
    await expect(dialog).toBeVisible();
    await expect(dialog).toContainText('This source is off, so the assistant does not read it.');
    await dialog.getByTestId('dialog-close').click();
    await expect(dialog).toBeHidden();

    // Remove it through the Edit Sheet's confirm
    await openSheet(row.getByTestId('settings-skill-edit-open'), adminPage.getByTestId('settings-skill-edit-sheet'));
    await adminPage.getByTestId('settings-skill-delete').click();
    await adminPage.getByTestId('settings-skill-remove-confirm').click();
    await expect(row).toHaveCount(0, { timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
  });
});
