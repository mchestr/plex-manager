import type { Browser } from '@playwright/test';

import { fixtureIssue } from '../lib/rewind/__tests__/helpers/fixture-issue';

import { axeFor } from './a11y/scan';
import { expect, test, TEST_USERS } from './fixtures/auth';
import { signInAs } from './fixtures/session';
import { createE2EPrismaClient } from './helpers/prisma';

/**
 * P5.12 (RWV-09, UI-09): `/rewind/[year]/read` is the whole issue as one
 * document that needs no JavaScript, reflows to 320 px, prints without its
 * chrome and passes axe at WCAG 2.2 AA. The issue is the heavy golden
 * fixture as P5.9's pipeline stores it, seeded for the admin. P5.4's
 * `rewind-a11y-*` projects run it on chromium, webkit and firefox (`@article`);
 * until they land it runs in the `chromium` project.
 */

const YEAR = 2026;
const URL = `/rewind/${YEAR}/read`;
let pageCount = 0;

async function seedIssue() {
  const issue = await fixtureIssue('heavy', { serial: 'K7Q4', nthRewind: 4 });
  pageCount = issue.pages.length;
  return {
    version: 3,
    year: YEAR,
    statsVersion: 'stats-2026.1',
    generatedAt: new Date('2026-12-01T12:00:00Z').toISOString(),
    window: { from: '2026-01-01', through: '2026-11-30', zone: 'America/Chicago', finalCut: false },
    edition: issue.edition,
    facts: issue.facts,
    pages: issue.pages.map(({ type, data }) => ({ type, data })),
    archetype: issue.archetype,
    copy: null,
    copySource: 'template',
    copyMeta: { model: null, promptVersion: 'e2e', slotHashes: {} },
    factsHash: 'e2e',
  };
}

async function adminContext(browser: Browser, baseURL: string | undefined, options: { javaScriptEnabled?: boolean } = {}) {
  const context = await browser.newContext(options);
  await signInAs(context, baseURL!, TEST_USERS.ADMIN.id);
  return context;
}

test.describe('Rewind article mode @article', () => {
  test.beforeAll(async () => {
    const data = await seedIssue();
    const prisma = createE2EPrismaClient();
    try {
      await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: YEAR } });
      await prisma.plexWrapped.create({
        data: { userId: TEST_USERS.ADMIN.id, year: YEAR, status: 'completed', data: JSON.stringify(data), generatedAt: new Date(data.generatedAt) },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: YEAR } });
    } finally {
      await prisma.$disconnect();
    }
  });

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
