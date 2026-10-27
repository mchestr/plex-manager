import { expect, type Page } from '@playwright/test';

/**
 * Opens a settings section's form with its Edit (or Set up) button. The
 * button is server-rendered before React hydrates it, and a click before then
 * does nothing, so click until the form shows.
 */
export async function editSection(page: Page, id: string): Promise<void> {
  const form = page.getByTestId(`settings-${id}-form`);
  await expect(async () => {
    if (await form.isVisible()) return;
    await page.getByTestId(`settings-${id}-edit`).click();
    await expect(form).toBeVisible({ timeout: 1000 });
  }).toPass();
}
