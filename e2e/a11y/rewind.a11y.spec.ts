import AxeBuilder from '@axe-core/playwright';
import type { Page } from '@playwright/test';

import { expect, test } from '../fixtures/session';
import { chooseCut, currentPage, currentPageInfo, disableAutoplay, goToPage, openStage, pageCount, turnForward } from '../helpers/rewind-stage';
import { clearRewindSeed, REWIND_MEMBERS, seedRewind, type RewindFixtureId } from '../helpers/seed-rewind';

/**
 * axe at WCAG 2.2 AA on every page of the story and every sheet it opens
 * (P5.4), in `rewind-a11y-chromium` and `rewind-a11y-webkit`. Unlike the
 * app's burn-down baseline (P1.7), Rewind allows no violation at any impact.
 * Article mode is scanned in `rewind-article.a11y.spec.ts` (`@article`, which
 * `rewind-a11y-firefox` runs too).
 */

const REWIND_AXE_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

const FIXTURES: RewindFixtureId[] = ['heavy', 'median', 'light'];

/** Waits until no animation runs, so axe never reads a colour mid-fade. */
async function animationsDone(page: Page): Promise<void> {
  await page.waitForFunction(() => document.getAnimations().every((animation) => animation.playState !== 'running'));
}

async function expectNoViolations(page: Page, where: string): Promise<void> {
  await animationsDone(page);
  const results = await new AxeBuilder({ page }).withTags(REWIND_AXE_TAGS).analyze();
  const found = results.violations.flatMap((violation) =>
    violation.nodes.map((node) => `${violation.id} (${violation.impact}): ${node.target.join(' ')}`)
  );
  expect(found, where).toEqual([]);
}

/** Opens a sheet with `open`, scans it, and closes it with Escape. */
async function scanSheet(page: Page, sheet: string, open: () => Promise<void>): Promise<void> {
  await open();
  await expect(page.getByTestId(sheet)).toBeVisible();
  await expectNoViolations(page, sheet);
  await page.keyboard.press('Escape');
  await expect(page.getByTestId(sheet)).toBeHidden();
}

test.describe('Rewind story axe', () => {
  test.beforeAll(seedRewind);
  test.afterAll(clearRewindSeed);

  test.beforeEach(async ({ page }) => {
    await disableAutoplay(page);
    await page.emulateMedia({ reducedMotion: 'reduce' });
  });

  for (const fixture of FIXTURES) {
    test(`${fixture}: every page`, async ({ page, signIn }) => {
      test.setTimeout(120_000);
      await signIn(REWIND_MEMBERS[fixture].id);
      await openStage(page);
      const total = await pageCount(page);
      for (let i = 0; i < total; i++) {
        if (i === 1) await chooseCut(page);
        else if (i > 1) await turnForward(page);
        await expect(currentPage(page)).toBeVisible();
        const { type } = await currentPageInfo(page);
        await expectNoViolations(page, `${fixture} page ${i + 1} (${type})`);
      }
    });
  }

  test('every sheet', async ({ page, signIn }) => {
    test.setTimeout(120_000);
    await signIn(REWIND_MEMBERS.median.id);
    await openStage(page);
    const stage = page.getByTestId('rewind-stage');

    await scanSheet(page, 'rewind-settings-sheet', () => page.getByTestId('rewind-settings').click());
    await scanSheet(page, 'rewind-share-sheet', () => page.getByTestId('rewind-share-slide').click());

    await goToPage(page, 'number');
    await scanSheet(page, 'rewind-table-sheet', () => page.getByTestId('rewind-table-toggle').click());

    await goToPage(page, 'top-shows');
    await scanSheet(page, 'rewind-row-sheet', () => currentPage(page).getByTestId('rewind-list-row').first().click());

    await goToPage(page, 'centrefold');
    await scanSheet(page, 'rewind-why-sheet', () => currentPage(page).getByTestId('rewind-archetype-why').click());

    await goToPage(page, 'back-cover');
    await scanSheet(page, 'rewind-contents-sheet', () => currentPage(page).getByTestId('rewind-contents').click());
    await expect(stage).toBeVisible();
  });

  test('the article offer below the scale floor', async ({ page, signIn }) => {
    await signIn(REWIND_MEMBERS.heavy.id);
    await page.setViewportSize({ width: 375, height: 548 });
    expect(await openStage(page, { offer: 'leave' })).toBe(true);
    await expect(page.getByTestId('rewind-article-offer')).toBeVisible();
    await expectNoViolations(page, 'rewind-article-offer');
  });
});
