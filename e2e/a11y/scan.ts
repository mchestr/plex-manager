import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import type { AxeResults } from 'axe-core';
import { enforceBaseline } from './baseline';
import { summarizeAxe } from './summarize';

/** WCAG 2.2 AA plus best-practice (which carries `region` and `heading-order`). */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/** Scans the whole page at every impact level, leaving out the `next dev` overlay. */
export function axeFor(page: Page): AxeBuilder {
  return new AxeBuilder({ page }).withTags(AXE_TAGS).exclude('nextjs-portal');
}

/**
 * Runs `builder` on a page whose fake clock `makeDeterministic` paused: axe
 * schedules its work on timers, which never fire until the clock resumes.
 */
export async function analyzeAtRest(page: Page, builder: AxeBuilder): Promise<AxeResults> {
  await page.clock.resume();
  return builder.analyze();
}

/**
 * Scans `page` and checks the counts against the baseline entry `name`, or
 * lowers that entry when `UPDATE_AXE_BASELINE=1`.
 */
export async function scanAgainstBaseline(page: Page, name: string): Promise<void> {
  const results = await analyzeAtRest(page, axeFor(page));
  enforceBaseline({
    route: name,
    summary: summarizeAxe(results),
    update: process.env.UPDATE_AXE_BASELINE === '1',
  });
}
