import { expect, type Page } from '@playwright/test';

/**
 * The setup claim (P11.32). playwright.config.ts sets `SETUP_TOKEN` for the
 * web server and every worker, so a spec that reopens setup claims the server
 * with it before the wizard renders.
 */
export function setupToken(): string {
  const token = process.env.SETUP_TOKEN;
  if (!token) throw new Error('SETUP_TOKEN is not set; playwright.config.ts sets it');
  return token;
}

/** Opens /setup and claims the server in this page's browser context. */
export async function claimSetup(page: Page): Promise<void> {
  await page.goto('/setup');
  await expect(page.getByTestId('setup-claim-form')).toBeVisible();
  await page.getByTestId('setup-claim-code-input').fill(setupToken());
  await page.getByTestId('setup-claim-submit').click();
  await expect(page.getByTestId('setup-claim-form')).toBeHidden();
}
