import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';
import axe, { type AxeResults } from 'axe-core';
import { enforceBaseline } from './baseline';
import { summarizeAxe } from './summarize';

/** WCAG 2.2 AA plus best-practice (which carries `region` and `heading-order`). */
export const AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];

/**
 * axe's `region` check counts dialogs as regions; an open listbox popup
 * (P3.5's Select, portalled to `<body>`) belongs to its combobox the same
 * way, through `aria-controls`, so it counts too.
 */
const REGION_MATCHER = 'dialog, [role=dialog], [role=alertdialog], svg, [role=listbox]';

/** axe itself, configured with {@link REGION_MATCHER} once it loads in the page. */
const AXE_SOURCE = `${axe.source}
axe.configure({ checks: [{ id: 'region', options: { regionMatcher: ${JSON.stringify(REGION_MATCHER)} } }] });`;

/** Scans the whole page at every impact level, leaving out the `next dev` overlay. */
export function axeFor(page: Page): AxeBuilder {
  return new AxeBuilder({ page, axeSource: AXE_SOURCE }).withTags(AXE_TAGS).exclude('nextjs-portal');
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
  try {
    enforceBaseline({
      route: name,
      summary: summarizeAxe(results),
      update: process.env.UPDATE_AXE_BASELINE === '1',
    });
  } catch (error) {
    // The message names three targets per key; the job log gets every one, so a
    // count that differs only in CI can be traced without the report artifact.
    const nodes = [...results.violations, ...results.incomplete].flatMap((rule) =>
      rule.nodes.map(
        (node) =>
          `${rule.id}${results.incomplete.includes(rule) ? ' (incomplete)' : ''}: ${node.target.join(' ')}` +
          // axe's reason, such as which element obscures it, so a CI-only node can be explained
          ` -- ${[...node.any, ...node.all, ...node.none].map((check) => check.message).join('; ')}`
      )
    );
    console.log(`axe nodes on ${name}:\n  ${nodes.join('\n  ')}`);
    throw error;
  }
}
