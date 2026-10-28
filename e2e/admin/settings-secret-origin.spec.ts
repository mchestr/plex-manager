import { expect, test } from '../fixtures/auth';
import { createE2EPrismaClient } from '../helpers/prisma';
import { editSection } from '../helpers/settings';

/**
 * P10.20 (SEC-31, design 6.4): a changed address never reuses a stored key.
 * The saved section shows the key only by its last four. In edit mode,
 * changing Overseerr's host empties the key field and makes it required,
 * Test and Save stay disabled until a key is typed, and a submit that gets
 * past the browser is refused by the server with SECRET_REQUIRED on the field.
 *
 * The seed has no Overseerr, so the spec saves one first (connection tests
 * are skipped in E2E mode) and removes it afterwards.
 */

const SAVED_URL = 'http://localhost:5055';
const NEW_URL = 'http://listener.invalid:5055';

test.describe.configure({ mode: 'serial' });

test.describe('Settings: a stored key stays with its address', () => {
  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.overseerr.deleteMany();
    } finally {
      await prisma.$disconnect();
    }
  });

  test('changing the host asks for the key again, in the browser and on the server', async ({ adminPage: page }) => {
    await page.goto('/admin/settings#overseerr');
    const section = page.getByTestId('settings-overseerr-section');
    const key = page.getByTestId('settings-overseerr-secret');
    const testButton = page.getByTestId('settings-overseerr-test');
    const save = page.getByTestId('settings-overseerr-save');

    // Set up an Overseerr with a key, so there is one to protect
    await editSection(page, 'overseerr');
    await page.getByTestId('settings-overseerr-name').fill('Requests');
    await page.getByTestId('settings-overseerr-url').fill(SAVED_URL);
    await key.fill('e2e-overseerr-key-a91c');
    await save.click();

    // The save returns the section to its summary: the key shows only by its last four
    await expect(page.getByTestId('settings-overseerr-summary-secret')).toContainText('Saved, ends in a91c');
    await expect(page.getByTestId('settings-overseerr-summary')).not.toContainText('e2e-overseerr-key');
    await expect(page.getByTestId('settings-overseerr-summary-url').locator('dd')).toHaveText(SAVED_URL);
    await expect(page.getByTestId('settings-overseerr-last-saved')).toContainText('Last saved just now');
    await expect(page.getByTestId('settings-overseerr-edit')).toBeFocused();

    // Editing shows the stored key as saved, never as a value
    await editSection(page, 'overseerr');
    await expect(page.getByTestId('settings-overseerr-secret-saved')).toBeVisible();
    await expect(key).toHaveValue('');
    await expect(key).toHaveAttribute('placeholder', /a91c$/);

    // A new host: the key field is empty and required, Test and Save are disabled
    await page.getByTestId('settings-overseerr-url').fill(NEW_URL);
    await expect(key).toHaveValue('');
    await expect(key).toHaveAttribute('data-state', 'reenter-required');
    await expect(key).toHaveAttribute('required', '');
    await expect(page.getByTestId('settings-overseerr-secret-reenter')).toContainText('Enter it again to use it with the new address');
    await expect(testButton).toBeDisabled();
    await expect(save).toBeDisabled();

    // Typing a key enables both
    await key.fill('typed-key');
    await expect(testButton).toBeEnabled();
    await expect(save).toBeEnabled();

    // Back to blank, then past the browser: the server still refuses
    await key.fill('');
    await expect(save).toBeDisabled();
    await save.evaluate((button) => {
      button.removeAttribute('disabled');
      button.removeAttribute('data-disabled');
      (button as HTMLButtonElement).form?.requestSubmit(button as HTMLButtonElement);
    });

    // The refused save keeps the section open, with the error on the field
    await expect(section.getByTestId('overseerr-secret-error')).toHaveText('Enter the API key again to use it with the new address.');
    await expect(key).toHaveAttribute('aria-invalid', 'true');
    await expect(page.getByTestId('settings-overseerr-form')).toBeVisible();
  });
});
