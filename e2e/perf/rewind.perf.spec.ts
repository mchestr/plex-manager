import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/session';
import { currentPage, openStage } from '../helpers/rewind-stage';
import { clearRewindSeed, REWIND_MEMBERS, seedRewind, type RewindFixtureId } from '../helpers/seed-rewind';

/**
 * The story's runtime budget (P5.4, design 11.2), in `rewind-perf` (chromium
 * only: it throttles the CPU through CDP). Each issue autoplays for 30 s at
 * 4x CPU throttling, from the cover once it has settled:
 *
 * - no long task may exceed 50 ms (a `PerformanceObserver` collects them);
 * - the stage commits only at page turns, at most 3 times per page:
 *   `StoryStage` records each commit while `window.__rwPerfProbe` is set
 *   (`components/rewind/stage/use-perf-probe.ts`), because React Profiler
 *   callbacks do not run in a production build.
 *
 * A last test injects an 80 ms busy loop on a turn and checks the gate sees
 * it, so a probe that stopped measuring cannot pass silently.
 */

const FIXTURES: RewindFixtureId[] = ['heavy', 'median', 'light'];
const PLAY_MS = 30_000;
const LONG_TASK_MS = 50;
const COMMITS_PER_PAGE = 3;

interface Probe {
  longTasks: { start: number; duration: number }[];
  commits: number[];
}

/** Sets the probe flag and collects long tasks from the first script on. */
async function installProbe(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const probe = window as unknown as { __rwPerfProbe: boolean; __rwLongTasks: { start: number; duration: number }[] };
    probe.__rwPerfProbe = true;
    probe.__rwLongTasks = [];
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) probe.__rwLongTasks.push({ start: entry.startTime, duration: entry.duration });
    }).observe({ type: 'longtask', buffered: true });
  });
}

/** Empties what the probe has collected so far (the load and the cover's entrance). */
function resetProbe(page: Page): Promise<void> {
  return page.evaluate(() => {
    const probe = window as unknown as Record<string, unknown[]>;
    probe.__rwLongTasks = [];
    probe.__rwCommits = [];
  });
}

function readProbe(page: Page): Promise<Probe> {
  return page.evaluate(() => {
    const probe = window as unknown as { __rwLongTasks?: Probe['longTasks']; __rwCommits?: number[] };
    return { longTasks: probe.__rwLongTasks ?? [], commits: probe.__rwCommits ?? [] };
  });
}

/** Opens the issue under 4x throttling and waits for the cover to settle. */
async function openThrottled(page: Page): Promise<void> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: 4 });
  await installProbe(page);
  await openStage(page);
  await page.waitForLoadState('networkidle');
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
}

/** Commits per page index, in the order the pages were shown. */
function commitsPerPage(commits: number[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const index of commits) counts.set(index, (counts.get(index) ?? 0) + 1);
  return counts;
}

test.describe('Rewind performance', () => {
  test.beforeAll(seedRewind);
  test.afterAll(clearRewindSeed);

  for (const fixture of FIXTURES) {
    test(`${fixture}: 30 s of autoplay at 4x throttling`, async ({ page, signIn }, testInfo) => {
      test.setTimeout(PLAY_MS + 90_000);
      await signIn(REWIND_MEMBERS[fixture].id);
      await openThrottled(page);
      await resetProbe(page);

      await page.getByTestId('rewind-stage').focus();
      await page.keyboard.press('Enter');
      await expect(currentPage(page)).toHaveAttribute('data-index', '1');
      await page.waitForTimeout(PLAY_MS);

      const { longTasks, commits } = await readProbe(page);
      const longest = Math.max(0, ...longTasks.map((task) => task.duration));
      const perPage = commitsPerPage(commits);
      const summary = `${fixture}: longest task ${Math.round(longest)} ms over ${longTasks.length} long tasks; commits per page ${JSON.stringify(Object.fromEntries(perPage))}`;
      console.log(summary);
      testInfo.annotations.push({ type: 'rewind-perf', description: summary });

      expect(perPage.size, 'autoplay turned at least one page').toBeGreaterThan(1);
      expect(longest, summary).toBeLessThanOrEqual(LONG_TASK_MS);
      for (const [index, count] of perPage) expect(count, `commits on page ${index + 1}`).toBeLessThanOrEqual(COMMITS_PER_PAGE);
    });
  }

  test('an 80 ms task on a turn fails the gate', async ({ page, signIn }) => {
    await signIn(REWIND_MEMBERS.heavy.id);
    // A busy loop each time the current page changes, as a slow turn would run.
    await page.addInitScript(() => {
      new MutationObserver((records) => {
        if (!records.some((r) => r.attributeName === 'data-current' && (r.target as Element).hasAttribute('data-current'))) return;
        const end = performance.now() + 80;
        while (performance.now() < end) {
          // Busy on purpose.
        }
      }).observe(document, { subtree: true, attributes: true, attributeFilter: ['data-current'] });
    });
    await openThrottled(page);
    await resetProbe(page);
    await page.getByTestId('rewind-stage').focus();
    await page.keyboard.press('Enter');
    await expect(currentPage(page)).toHaveAttribute('data-index', '1');
    await expect.poll(async () => Math.max(0, ...(await readProbe(page)).longTasks.map((task) => task.duration))).toBeGreaterThan(LONG_TASK_MS);
  });
});
