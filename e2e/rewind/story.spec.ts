import { expect, test } from '../fixtures/session';
import { currentPage, disableAutoplay, goToPage, openStage } from '../helpers/rewind-stage';
import { clearRewindSeed, REWIND_ISSUES, REWIND_MEMBERS, seedRewind } from '../helpers/seed-rewind';

/**
 * The story player's flows on the test ids of Rewind design 12 (P5.4), in
 * `rewind-e2e-chromium` and `rewind-e2e-webkit`: the median member's issue at
 * 390x844, where every page is built. Later flows stay `test.fixme` with the
 * step that owns them.
 */

test.describe('Rewind story', () => {
  test.beforeAll(seedRewind);
  test.afterAll(clearRewindSeed);

  test.beforeEach(async ({ signIn }) => {
    await signIn(REWIND_MEMBERS.median.id);
  });

  test.describe('with autoplay off', () => {
    test.beforeEach(async ({ page }) => {
      await disableAutoplay(page);
      await openStage(page);
      await page.getByTestId('rewind-cut-full').click();
      await expect(currentPage(page)).toHaveAttribute('data-index', '1');
    });

    test('the tap zones and ArrowRight turn pages', async ({ page }) => {
      const pages = page.getByTestId('rewind-pages');
      const box = (await pages.boundingBox())!;
      const y = box.y + box.height / 2;

      await page.mouse.click(box.x + box.width - 8, y);
      await expect(currentPage(page)).toHaveAttribute('data-index', '2');
      await page.mouse.click(box.x + 8, y);
      await expect(currentPage(page)).toHaveAttribute('data-index', '1');

      await page.keyboard.press('ArrowRight');
      await expect(currentPage(page)).toHaveAttribute('data-index', '2');
    });

    test('Space toggles Pause, and turning the shortcuts off stops K', async ({ page }) => {
      const pause = page.getByTestId('rewind-pause');
      await expect(pause).toHaveAttribute('aria-label', 'Play');
      await page.keyboard.press('Space');
      await expect(pause).toHaveAttribute('aria-label', 'Pause');
      await page.keyboard.press('Space');
      await expect(pause).toHaveAttribute('aria-label', 'Play');

      await page.getByTestId('rewind-settings').click();
      const sheet = page.getByTestId('rewind-settings-sheet');
      await expect(sheet).toBeVisible();
      await sheet.getByTestId('rewind-shortcuts-switch').click();
      await expect(sheet.getByTestId('rewind-shortcuts-switch')).toHaveAttribute('aria-checked', 'false');
      await page.keyboard.press('Escape');
      await expect(sheet).toBeHidden();

      await page.getByTestId('rewind-stage').focus();
      await page.keyboard.press('k');
      await expect(pause).toHaveAttribute('aria-label', 'Play');
    });

    test('the Table sheet opens on a chart page and closes', async ({ page }) => {
      await goToPage(page, 'number');
      await page.getByTestId('rewind-table-toggle').click();
      const sheet = page.getByTestId('rewind-table-sheet');
      await expect(sheet).toBeVisible();
      await expect(sheet.getByRole('table')).toBeVisible();
      await sheet.getByRole('button', { name: 'Close' }).click();
      await expect(sheet).toBeHidden();
      await expect(page.getByTestId('rewind-stage')).toHaveAttribute('data-mode', 'paused');
    });

    test('the quiz answers, and the chosen tile flies into Top shows', async ({ page }) => {
      const guess = REWIND_ISSUES.median.pages.find((p) => p.type === 'guess')!;
      const options = (guess.data as { options: { rank: number }[] }).options;
      const answer = options.findIndex((option) => option.rank === 1) + 1;

      await goToPage(page, 'guess');
      await currentPage(page).getByTestId(`rewind-quiz-option-${answer}`).click();
      await expect(currentPage(page).getByTestId('rewind-quiz-answer')).toBeVisible();
      await expect(currentPage(page).getByTestId('rewind-quiz-reveal')).not.toBeEmpty();
      await expect(currentPage(page).getByTestId('rewind-quiz-mark')).toHaveCount(options.length);

      // The flight lasts under half a second in real time, so record it as it lands in the layer.
      await page.evaluate(() => {
        const layer = document.querySelector('[data-testid="rewind-match-cut-layer"]')!;
        const seen = window as unknown as { rwMatchCut?: boolean };
        new MutationObserver((records) => {
          if (records.some((r) => [...r.addedNodes].some((n) => n instanceof Element && n.getAttribute('data-testid') === 'rewind-match-cut'))) {
            seen.rwMatchCut = true;
          }
        }).observe(layer, { childList: true });
      });
      await page.getByTestId('rewind-stage').focus();
      await page.keyboard.press('ArrowRight');
      await expect(currentPage(page).getByTestId('rewind-page-top-shows')).toBeVisible();
      await expect.poll(() => page.evaluate(() => (window as unknown as { rwMatchCut?: boolean }).rwMatchCut === true)).toBe(true);
      await expect(page.getByTestId('rewind-match-cut')).toHaveCount(0);
    });
  });

  test('a hidden tab pauses autoplay', async ({ page }) => {
    await openStage(page);
    await page.getByTestId('rewind-cut-full').click();
    const pause = page.getByTestId('rewind-pause');
    await expect(pause).toHaveAttribute('aria-label', 'Pause');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
      Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(pause).toHaveAttribute('aria-label', 'Play');
  });

  test.fixme('with Redis down the issue shows the unavailable panel (FR-50)', async () => {});
  test.fixme('a lapsed subscriber keeps their Rewind but cannot share it (FR-51)', async () => {});
});
