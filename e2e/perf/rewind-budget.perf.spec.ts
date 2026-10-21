import { gzipSync } from 'node:zlib';

import type { Page, Response } from '@playwright/test';

import { expect, signInAs, test } from '../fixtures/session';
import { openStage } from '../helpers/rewind-stage';
import { ARCHIVE_YEAR, clearRewindSeed, REWIND_MEMBERS, seedArchiveRewind, seedRewind } from '../helpers/seed-rewind';
import { WAIT_TIMEOUTS } from '../helpers/test-utils';

/**
 * The first-page JavaScript budget (P5.4, NFR-5): the scripts that only
 * `/rewind/<year>` loads, up to `networkidle`, gzip to at most 110 KB.
 * React, Next and the root providers load on a 404 page of the same build
 * too, so they are left out. The measured size is logged on every run.
 *
 * No `/rewind` route loads chart.js (P7.13): the story, the article and a
 * stored 2025 year, now an archive article, are checked for its code.
 */

const BUDGET_BYTES = 110 * 1024;
/** An error message only chart.js's own code holds, minified or not. */
const CHART_JS_MARKER = 'Failed to create chart';

/** Every script `page` receives while `load` runs, by URL, with its body. */
async function scriptsWhile(page: Page, load: () => Promise<void>): Promise<Map<string, Buffer>> {
  const pending: Promise<void>[] = [];
  const scripts = new Map<string, Buffer>();
  const onResponse = (response: Response) => {
    if (response.request().resourceType() !== 'script' || !response.ok()) return;
    pending.push(
      response.body().then(
        (body) => void scripts.set(response.url(), body),
        () => undefined
      )
    );
  };
  page.on('response', onResponse);
  await load();
  await page.waitForLoadState('networkidle');
  page.off('response', onResponse);
  await Promise.all(pending);
  return scripts;
}

test.describe('Rewind first-page JavaScript', () => {
  test.beforeAll(async () => {
    await seedRewind();
    await seedArchiveRewind(REWIND_MEMBERS.heavy.id);
  });
  test.afterAll(clearRewindSeed);

  test('the scripts only Rewind loads gzip to 110 KB or less', async ({ browser, baseURL }) => {
    // Separate contexts, so neither page reads the other's scripts from the cache.
    const shell = await browser.newContext();
    const rewind = await browser.newContext();
    await signInAs(shell, baseURL!, REWIND_MEMBERS.heavy.id);
    await signInAs(rewind, baseURL!, REWIND_MEMBERS.heavy.id);

    const notFoundPage = await shell.newPage();
    const base = await scriptsWhile(notFoundPage, async () => {
      await notFoundPage.goto('/rewind-budget-no-such-page');
    });
    const rewindPage = await rewind.newPage();
    const loaded = await scriptsWhile(rewindPage, async () => {
      await openStage(rewindPage);
    });

    const pathOf = (url: string) => new URL(url).pathname;
    const shared = new Set([...base.keys()].map(pathOf));
    const own = [...loaded].filter(([url]) => !shared.has(pathOf(url)));
    const gzipped = own.map(([url, body]) => ({ url: pathOf(url), bytes: gzipSync(body).length }));
    const total = gzipped.reduce((sum, script) => sum + script.bytes, 0);

    const summary = `Rewind first-page JavaScript: ${(total / 1024).toFixed(1)} KB gzipped in ${gzipped.length} scripts (budget ${BUDGET_BYTES / 1024} KB)`;
    console.log(summary);
    for (const script of gzipped.sort((a, b) => b.bytes - a.bytes)) console.log(`  ${(script.bytes / 1024).toFixed(1)} KB ${script.url}`);
    test.info().annotations.push({ type: 'rewind-js-budget', description: summary });

    expect(base.size, 'the 404 page loaded the shared scripts').toBeGreaterThan(0);
    expect(total, summary).toBeLessThanOrEqual(BUDGET_BYTES);
    await shell.close();
    await rewind.close();
  });

  test('no /rewind route loads chart.js, the 2025 archive included', async ({ page, signIn }) => {
    await signIn(REWIND_MEMBERS.heavy.id);

    const archive = await scriptsWhile(page, async () => {
      await page.goto(`/rewind/${ARCHIVE_YEAR}`);
      await expect(page.getByTestId('rewind-article-mode')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    });
    const article = await scriptsWhile(page, async () => {
      await page.goto('/rewind/2026/read');
      await expect(page.getByTestId('rewind-article-mode')).toBeVisible({ timeout: WAIT_TIMEOUTS.PAGE_CONTENT });
    });
    const story = await scriptsWhile(page, async () => {
      await openStage(page);
    });

    const charted = [...archive, ...article, ...story]
      .filter(([, body]) => body.toString('utf8').includes(CHART_JS_MARKER))
      .map(([url]) => new URL(url).pathname);
    expect(archive.size, 'the archive page loaded scripts').toBeGreaterThan(0);
    expect(charted).toEqual([]);
  });
});
