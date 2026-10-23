import { expect, test, type Page } from '@playwright/test';

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

/**
 * Claims the server and gives `page`'s browser context the claim cookie.
 *
 * The claim runs in a fresh context of its own: the visual and axe specs pause
 * the page's clock (`makeDeterministic`), and with it paused React never
 * reveals the streamed /setup content, so the form would stay hidden.
 */
export async function claimSetup(page: Page): Promise<void> {
  const browser = page.context().browser();
  if (!browser) throw new Error('claimSetup needs a page from a launched browser');
  const claimContext = await browser.newContext({ baseURL: test.info().project.use.baseURL });
  try {
    const claimPage = await claimContext.newPage();
    await claimPage.goto('/setup');
    await expect(claimPage.getByTestId('setup-claim-form')).toBeVisible();
    await claimPage.getByTestId('setup-claim-code-input').fill(setupToken());
    await claimPage.getByTestId('setup-claim-submit').click();
    await expect(claimPage.getByTestId('setup-claim-form')).toBeHidden();
    await page.context().addCookies(await claimContext.cookies());
  } finally {
    await claimContext.close();
  }
}
