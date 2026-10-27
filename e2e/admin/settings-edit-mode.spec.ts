import { expect, test } from '../fixtures/auth';

/**
 * Settings sections open read-only and edit one at a time (design 6.4): Edit
 * moves focus into the form, Escape and Cancel return it to Edit, unsaved
 * changes are never dropped without asking, and opening another section
 * closes a clean one. The seed's Plex server is read, never written.
 */

test.describe('Settings: read-only sections with an Edit mode', () => {
  test('a section shows its saved values until Edit, which opens the form on its first field', async ({ adminPage: page }) => {
    await page.goto('/admin/settings');

    const section = page.getByTestId('settings-plex-section');
    await expect(page.getByTestId('settings-plex-summary')).toBeVisible();
    await expect(page.getByTestId('settings-plex-summary-name')).toContainText('Name');
    await expect(section.getByRole('textbox')).toHaveCount(0);
    await expect(section.getByRole('button', { name: 'Test connection for Plex server' })).toBeVisible();

    const edit = section.getByRole('button', { name: 'Edit Plex server' });
    await edit.focus();
    await page.keyboard.press('Enter');

    await expect(page.getByTestId('settings-plex-form')).toBeVisible();
    await expect(page.getByTestId('settings-plex-editing')).toHaveText('Editing');
    await expect(page.getByTestId('settings-plex-name')).toBeFocused();
    await expect(page.getByTestId('settings-plex-name')).toBeInViewport();
    await expect(page.getByTestId('settings-plex-save')).toBeEnabled();

    // Escape on a clean form closes it, and focus returns to Edit
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('settings-plex-summary')).toBeVisible();
    await expect(page.getByTestId('settings-plex-edit')).toBeFocused();
  });

  test('unsaved changes are kept until the admin chooses to discard them', async ({ adminPage: page }) => {
    await page.goto('/admin/settings');
    const name = page.getByTestId('settings-plex-name');

    await page.getByTestId('settings-plex-edit').click();
    const saved = await name.inputValue();
    await name.fill(`${saved} (edited)`);
    await expect(page.getByTestId('settings-plex-unsaved')).toBeVisible();

    // Escape asks first; Keep editing keeps the typed value
    await page.keyboard.press('Escape');
    const dialog = page.getByTestId('settings-plex-discard-dialog');
    await expect(dialog).toContainText('Discard changes to Plex server?');
    await dialog.getByRole('button', { name: 'Keep editing' }).click();
    await expect(dialog).toBeHidden();
    await expect(name).toHaveValue(`${saved} (edited)`);

    // Cancel asks too; Discard changes puts the saved value back
    await page.getByTestId('settings-plex-cancel').click();
    await page.getByTestId('settings-plex-discard-dialog-confirm').click();
    await expect(page.getByTestId('settings-plex-summary-name')).toContainText(saved);
    await expect(page.getByTestId('settings-plex-unsaved')).toHaveCount(0);
    await expect(page.getByTestId('settings-plex-edit')).toBeFocused();
  });

  test('opening another section closes a clean one, and Save with nothing changed just closes', async ({ adminPage: page }) => {
    await page.goto('/admin/settings');

    await page.getByTestId('settings-plex-edit').click();
    await expect(page.getByTestId('settings-plex-form')).toBeVisible();

    // The seed has no Tautulli: its button reads Set up
    await expect(page.getByTestId('settings-tautulli-edit')).toHaveText(/Set up/);
    await page.getByTestId('settings-tautulli-edit').click();
    await expect(page.getByTestId('settings-tautulli-form')).toBeVisible();
    await expect(page.getByTestId('settings-tautulli-name')).toBeFocused();
    await expect(page.getByTestId('settings-plex-form')).toHaveCount(0);
    await expect(page.getByTestId('settings-plex-summary')).toBeVisible();

    await page.getByTestId('settings-tautulli-cancel').click();
    await expect(page.getByTestId('settings-tautulli-empty')).toHaveText('Not set up.');

    await page.getByTestId('settings-plex-edit').click();
    await page.getByTestId('settings-plex-save').click();
    await expect(page.getByTestId('settings-plex-summary')).toBeVisible();
    await expect(page.getByTestId('settings-plex-edit')).toBeFocused();
  });
});
