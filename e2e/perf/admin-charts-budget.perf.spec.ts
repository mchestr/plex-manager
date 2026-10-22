import { gzipSync } from 'node:zlib';

import type { Page, Response } from '@playwright/test';

import { expect, test } from '../fixtures/auth';

/**
 * The admin chart budget (P10.9, BP-34): the scripts each chart page loads
 * beyond `/admin/users` (the admin shell, with no chart), up to
 * `networkidle`, gzipped. ChartCard's Recharts body is a `next/dynamic`
 * island, so it counts here and nowhere else. The sizes are logged on every
 * run.
 *
 * BUDGET_BYTES is provisional: set it to the first measured size plus 10%
 * and record the before (Chart.js) and after numbers in the PR.
 *
 * No `/rewind` route loads Recharts either; `rewind-budget.perf.spec.ts`
 * keeps the 110 KB Rewind first-page budget.
 */
const BUDGET_BYTES = 200 * 1024;
const PAGES = [
  { path: '/admin/cost-analysis', ready: 'admin-cost-analysis-header' },
  { path: '/admin/discord', ready: 'discord-status' },
  { path: '/admin/shares', ready: 'admin-shares-header' },
];

const pathOf = (url: string) => new URL(url).pathname;

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

test.describe('Admin chart JavaScript', () => {
  for (const { path, ready } of PAGES) {
    test(`${path}: the scripts beyond the admin shell gzip to the budget or less`, async ({ adminPage }) => {
      test.setTimeout(120_000);
      const base = await scriptsWhile(adminPage, async () => {
        await adminPage.goto('/admin/users');
      });
      // The shell's scripts are left out by path, so a cached copy changes nothing.
      const chartPage = await adminPage.context().newPage();
      const loaded = await scriptsWhile(chartPage, async () => {
        await chartPage.goto(path);
        await expect(chartPage.getByTestId(ready)).toBeVisible();
      });

      const shared = new Set([...base.keys()].map(pathOf));
      const own = [...loaded].filter(([url]) => !shared.has(pathOf(url)));
      const gzipped = own.map(([url, body]) => ({ url: pathOf(url), bytes: gzipSync(body).length }));
      const total = gzipped.reduce((sum, script) => sum + script.bytes, 0);

      const summary = `${path} chart JavaScript: ${(total / 1024).toFixed(1)} KB gzipped in ${gzipped.length} scripts (budget ${BUDGET_BYTES / 1024} KB)`;
      console.log(summary);
      for (const script of gzipped.sort((a, b) => b.bytes - a.bytes)) console.log(`  ${(script.bytes / 1024).toFixed(1)} KB ${script.url}`);
      test.info().annotations.push({ type: 'admin-chart-js-budget', description: summary });

      expect(base.size, 'the admin shell loaded its scripts').toBeGreaterThan(0);
      expect(total, summary).toBeLessThanOrEqual(BUDGET_BYTES);
      await chartPage.close();
    });
  }
});
