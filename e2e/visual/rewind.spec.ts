import type { Page } from '@playwright/test';

import { chooseCut, currentPage, currentPageInfo, disableAutoplay, openStage, pageCount, turnForward } from '../helpers/rewind-stage';
import { clearRewindSeed, REWIND_MEMBERS, seedRewind, type RewindFixtureId } from '../helpers/seed-rewind';
import { settle } from '../helpers/deterministic';
import { expect, settlePage, skipUnlessProductionBuild, test } from './visual-test';

/**
 * Rewind story screenshots (P5.4): every page of the heavy, median and light
 * issues, taken of `rewind-stage`, in the `rewind-visual-*` projects. Phone
 * projects loop over the five supported phone sizes; desktop projects use
 * their own 1440x900 (P7.4 adds 1366x768).
 *
 * The final-state shots run under reduced motion with the fake clock paused
 * (`visual-test.ts`). One more pass per fixture, at the project's first size,
 * plays normal motion and runs the clock past the 1.4 s entrances. Autoplay
 * is off, so only ArrowRight turns pages. Posters render as title cards: the
 * E2E Plex server is unreachable.
 *
 * On a phone, a size at or above the 0.8 scale floor must render no text
 * under 12 px and no stage control under 44x44 px; below the floor the
 * article offer must open instead (design 4.7, 11.1).
 */

const FIXTURES: RewindFixtureId[] = ['heavy', 'median', 'light'];

const PHONE_VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 412, height: 760 },
  { width: 390, height: 664 },
  { width: 360, height: 640 },
  { width: 375, height: 548 },
];

/** Viewports where story mode scales under 0.8 (`lib/rewind/stage/fit-stage.ts`). */
const BELOW_FLOOR = new Set(['360x640', '375x548']);

const MIN_TEXT_PX = 12;
const MIN_TARGET_PX = 44;

/** Text under 12 px and controls under 44x44 px on the current page and the chrome. */
function smallThings(page: Page): Promise<{ text: string[]; targets: string[] }> {
  return page.evaluate(
    ({ minText, minTarget }) => {
      const stage = document.querySelector('[data-testid="rewind-stage"]')!;
      const scopes = [
        stage.querySelector('[data-testid="rewind-page"][data-current]'),
        stage.querySelector('[data-testid="rewind-chrome-top"]'),
        stage.querySelector('[data-testid="rewind-chrome-bottom"]'),
      ].filter((el): el is Element => el !== null);
      const shown = (el: Element) => {
        const rect = el.getBoundingClientRect();
        const style = getComputedStyle(el);
        return rect.width > 1 && rect.height > 1 && style.visibility !== 'hidden' && el.closest('[aria-hidden="true"], .sr-only') === null;
      };
      const label = (el: Element) => el.getAttribute('data-testid') ?? `${el.tagName.toLowerCase()} "${(el.textContent ?? '').trim().slice(0, 30)}"`;

      const text: string[] = [];
      const targets: string[] = [];
      for (const scope of scopes) {
        for (const el of scope.querySelectorAll('*')) {
          const ownText = [...el.childNodes].some((node) => node.nodeType === Node.TEXT_NODE && (node.textContent ?? '').trim() !== '');
          if (ownText && shown(el)) {
            // Pages size text in CSS (`calc(var(--u) * N)`), never with a transform.
            const px = parseFloat(getComputedStyle(el).fontSize);
            if (px < minText - 0.05) text.push(`${label(el)}: ${px.toFixed(2)} px`);
          }
        }
        for (const el of scope.querySelectorAll('a[href], button, [role="button"], [role="radio"], input, select, textarea')) {
          if (!shown(el)) continue;
          // The hit area: the box, or its unscaled ::before expander when that is larger (design 11.1).
          const rect = el.getBoundingClientRect();
          const before = getComputedStyle(el, '::before');
          const expanded = before.content !== 'none' && before.position === 'absolute';
          const width = Math.max(rect.width, expanded ? parseFloat(before.width) || 0 : 0);
          const height = Math.max(rect.height, expanded ? parseFloat(before.height) || 0 : 0);
          if (width < minTarget - 0.5 || height < minTarget - 0.5) {
            targets.push(`${label(el)}: ${width.toFixed(0)}x${height.toFixed(0)}`);
          }
        }
      }
      return { text, targets };
    },
    { minText: MIN_TEXT_PX, minTarget: MIN_TARGET_PX }
  );
}

/** Screenshots the stage as `<prefix>-<nn>-<type>.png`, then turns to the next page, until the last. */
async function shootEveryPage(page: Page, prefix: string, check: boolean): Promise<void> {
  const total = await pageCount(page);
  for (let i = 0; i < total; i++) {
    if (i === 1) await chooseCut(page);
    else if (i > 1) await turnForward(page);
    await settlePage(page);
    const { index, type } = await currentPageInfo(page);
    expect(index).toBe(i);
    if (check) expect.soft(await smallThings(page), `${prefix} page ${i + 1} (${type})`).toEqual({ text: [], targets: [] });
    await expect(page.getByTestId('rewind-stage')).toHaveScreenshot(`${prefix}-${String(i + 1).padStart(2, '0')}-${type}.png`);
  }
}

test.describe('Rewind story', () => {
  skipUnlessProductionBuild();

  test.beforeAll(seedRewind);
  test.afterAll(clearRewindSeed);

  test.beforeEach(async ({ page }) => {
    await disableAutoplay(page);
  });

  for (const fixture of FIXTURES) {
    test.describe(fixture, () => {
      test.beforeEach(async ({ signIn }) => {
        await signIn(REWIND_MEMBERS[fixture].id);
      });

      test('every page at every size', async ({ page }, testInfo) => {
        test.setTimeout(240_000);
        const phone = testInfo.project.use.isMobile === true;
        const viewports = phone ? PHONE_VIEWPORTS : [testInfo.project.use.viewport!];
        for (const viewport of viewports) {
          const size = `${viewport.width}x${viewport.height}`;
          await page.setViewportSize(viewport);
          const offered = await openStage(page, { offer: 'leave', settle: settlePage });
          const belowFloor = BELOW_FLOOR.has(size);
          expect(offered, `article offer at ${size}`).toBe(phone && belowFloor);
          if (offered) {
            await expect(page.getByTestId('rewind-stage')).toHaveScreenshot(`${fixture}-${size}-00-article-offer.png`);
            await page.getByTestId('rewind-article-offer-story').click();
            await settlePage(page);
            await expect(page.getByTestId('rewind-article-offer')).toBeHidden();
          }
          await shootEveryPage(page, `${fixture}-${size}`, phone && !belowFloor);
        }
      });

      test('every page in motion', async ({ page }, testInfo) => {
        test.setTimeout(120_000);
        const viewport = testInfo.project.use.isMobile ? PHONE_VIEWPORTS[0] : testInfo.project.use.viewport!;
        await page.setViewportSize(viewport);
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await openStage(page, { settle: settlePage });
        const total = await pageCount(page);
        for (let i = 0; i < total; i++) {
          if (i === 1) await chooseCut(page);
          else if (i > 1) await turnForward(page);
          // The entrances end by 1.4 s; settlePage then finishes what Motion runs in real time.
          await settle(page, 1500);
          await settlePage(page);
          const { type } = await currentPageInfo(page);
          await expect(currentPage(page)).toBeVisible();
          await expect(page.getByTestId('rewind-stage')).toHaveScreenshot(`${fixture}-motion-${String(i + 1).padStart(2, '0')}-${type}.png`);
        }
      });
    });
  }
});
