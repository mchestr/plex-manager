import type { Browser } from '@playwright/test';

import { expect, test, TEST_USERS } from '../fixtures/auth';
import { signInAs } from '../fixtures/session';
import { clearRewindIssue, REWIND_ISSUES, REWIND_YEAR, seedRewindIssue } from '../helpers/seed-rewind';
import { axeFor } from './scan';

/**
 * P5.12 (RWV-09, UI-09): `/rewind/[year]/read` is the whole issue as one
 * document that needs no JavaScript, reflows to 320 px, prints without its
 * chrome and passes axe at WCAG 2.2 AA. The issue is the heavy golden
 * fixture as P5.9's pipeline stores it (`e2e/helpers/seed-rewind.ts`),
 * seeded for the admin. `rewind-a11y-chromium`, `rewind-a11y-webkit` and
 * `rewind-a11y-firefox` run it (`@article`, P5.4).
 */

const YEAR = REWIND_YEAR;
const URL = `/rewind/${YEAR}/read`;
const pageCount = REWIND_ISSUES.heavy.pages.length;

async function adminContext(browser: Browser, baseURL: string | undefined, options: { javaScriptEnabled?: boolean } = {}) {
  const context = await browser.newContext(options);
  await signInAs(context, baseURL!, TEST_USERS.ADMIN.id);
  return context;
}

test.describe('Rewind article mode @article', () => {
  test.beforeAll(() => seedRewindIssue(TEST_USERS.ADMIN.id, 'heavy'));
  test.afterAll(() => clearRewindIssue(TEST_USERS.ADMIN.id));

  test('renders every section with JavaScript off, and the console stays clean', async ({ browser, baseURL }) => {
    const context = await adminContext(browser, baseURL, { javaScriptEnabled: false });
    const page = await context.newPage();
    const errors: string[] = [];
    page.on('console', (message) => message.type() === 'error' && errors.push(message.text()));
    page.on('pageerror', (error) => errors.push(error.message));

    await page.goto(URL);
    await expect(page.getByTestId('rewind-article-mode')).toBeVisible();
    await expect(page.getByTestId('rewind-article-section')).toHaveCount(pageCount);
    for (const section of await page.getByTestId('rewind-article-section').all()) await expect(section).toBeVisible();
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(`The ${YEAR} issue`);
    expect(errors).toEqual([]);
    await context.close();
  });

  test('reflows to 320 px without a horizontal scroll', async ({ browser, baseURL }) => {
    const context = await adminContext(browser, baseURL);
    const page = await context.newPage();
    await page.setViewportSize({ width: 320, height: 640 });
    await page.goto(URL);
    await expect(page.getByTestId('rewind-article-mode')).toBeVisible();
    const scrollWidth = await page.evaluate(() => document.documentElement.scrollWidth);
    expect(scrollWidth).toBeLessThanOrEqual(320);
    await context.close();
  });

  test('print hides the chrome', async ({ browser, baseURL }) => {
    const context = await adminContext(browser, baseURL);
    const page = await context.newPage();
    await page.goto(URL);
    await expect(page.getByTestId('rewind-article-story')).toBeVisible();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('rewind-article-story')).toBeHidden();
    await expect(page.getByTestId('rewind-article-mode')).toBeVisible();
    await context.close();
  });

  test('"Play the story" returns to the story', async ({ browser, baseURL }) => {
    const context = await adminContext(browser, baseURL);
    const page = await context.newPage();
    await page.goto(URL);
    await page.getByTestId('rewind-article-story').click();
    await expect(page).toHaveURL(new RegExp(`/rewind/${YEAR}$`));
    await context.close();
  });

  test('axe at WCAG 2.2 AA finds no violations', async ({ browser, baseURL }) => {
    const context = await adminContext(browser, baseURL);
    const page = await context.newPage();
    await page.goto(URL);
    await expect(page.getByTestId('rewind-article-mode')).toBeVisible();
    const results = await axeFor(page).analyze();
    expect(results.violations.map((v) => `${v.id}: ${v.nodes.length}`)).toEqual([]);
    await context.close();
  });
});
