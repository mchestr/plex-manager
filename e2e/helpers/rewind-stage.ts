import { expect, type Locator, type Page } from '@playwright/test';

import { REWIND_YEAR } from './seed-rewind';
import { WAIT_TIMEOUTS } from './test-utils';

/**
 * Driving the Rewind story stage from a spec (P5.4), on the test ids of
 * Rewind design 12. Each helper waits for the state it causes, so a spec
 * never sleeps.
 *
 * @module e2e/helpers/rewind-stage
 */

/** The current page: the one `<article>` the stage marks `data-current`. */
export function currentPage(page: Page): Locator {
  return page.locator('[data-testid="rewind-page"][data-current]');
}

/** The current page's position and type (`rewind-page-<type>` inside it). */
export async function currentPageInfo(page: Page): Promise<{ index: number; type: string }> {
  return currentPage(page).evaluate((el) => {
    const body = el.querySelector('[data-testid^="rewind-page-"]');
    return {
      index: Number(el.getAttribute('data-index')),
      type: body?.getAttribute('data-testid')?.replace('rewind-page-', '') ?? 'unknown',
    };
  });
}

/** How many pages the issue has. */
export function pageCount(page: Page): Promise<number> {
  return page.locator('[data-testid="rewind-page"]').count();
}

interface OpenOptions {
  /** Below the 0.8 scale floor the article offer opens: `'story'` (the default) plays the story, `'leave'` keeps the sheet. */
  offer?: 'story' | 'leave';
  query?: string;
  /**
   * Lets a page under a paused fake clock (`makeDeterministic`) finish
   * loading: React reveals the streamed page on a timer, which never fires
   * until the clock runs. Pass `settlePage` there.
   */
  settle?: (page: Page) => Promise<void>;
}

/** Opens `/rewind/<year>` and waits for the stage. Returns whether the article offer opened. */
export async function openStage(page: Page, options: OpenOptions = {}): Promise<boolean> {
  await page.goto(`/rewind/${REWIND_YEAR}${options.query ?? ''}`);
  await options.settle?.(page);
  const stage = page.getByTestId('rewind-stage');
  await expect(stage).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
  // The streamed stage shows before it hydrates. `data-fitted` marks the first
  // fit, whose commit already decided the offer (a layout effect).
  await expect(stage).toHaveAttribute('data-fitted');
  await expect(currentPage(page)).toBeVisible();
  const offer = page.getByTestId('rewind-article-offer');
  if ((await stage.getAttribute('data-mode')) === 'sheet') await expect(page.getByRole('dialog')).toBeVisible();
  const offered = await offer.isVisible();
  if (offered && options.offer !== 'leave') {
    await page.getByTestId('rewind-article-offer-story').click();
    await options.settle?.(page);
    await expect(offer).toBeHidden();
  }
  return offered;
}

/**
 * Chooses the cut on the cover with Enter (the full issue, or the pocket
 * edition when it is the only cut). The keyboard reaches the choice at every
 * size, where a pill may sit under the chrome on the smallest phones.
 */
export async function chooseCut(page: Page): Promise<void> {
  await page.getByTestId('rewind-stage').focus();
  await page.keyboard.press('Enter');
  await expect(currentPage(page)).toHaveAttribute('data-index', '1');
}

/** Turns one page forward with ArrowRight on the stage. */
export async function turnForward(page: Page): Promise<void> {
  const { index } = await currentPageInfo(page);
  await page.getByTestId('rewind-stage').focus();
  await page.keyboard.press('ArrowRight');
  await expect(currentPage(page)).toHaveAttribute('data-index', String(index + 1));
}

/** Goes to the first page of `type`, from the cover, by ArrowRight. */
export async function goToPage(page: Page, type: string): Promise<void> {
  const total = await pageCount(page);
  for (let step = 0; step < total; step++) {
    if ((await currentPageInfo(page)).type === type) return;
    if (step === 0 && (await page.getByTestId('rewind-stage').getAttribute('data-mode')) === 'cover') await chooseCut(page);
    else await turnForward(page);
  }
  if ((await currentPageInfo(page)).type !== type) throw new Error(`The issue has no ${type} page`);
}

/** Turns autoplay off before the page loads, so only the spec turns pages. */
export async function disableAutoplay(page: Page): Promise<void> {
  await page.addInitScript(() => {
    try {
      window.localStorage.setItem('rewind:prefs:v1', JSON.stringify({ autoplay: false }));
    } catch {
      // Storage is always there in a Playwright context.
    }
  });
}
