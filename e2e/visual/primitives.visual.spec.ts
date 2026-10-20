import type { Page } from '@playwright/test';
import { capture, expect, expectScreen, settlePage, skipUnlessProductionBuild, test } from './visual-test';

/**
 * The /dev/ui primitives sheet (P3.4), the regression target for
 * components/ui: the dark theme, then the light theme by swapping the class on
 * <html>, then the overlays open (P3.6), then the three Rewind ink panels and
 * the open sheets (P3.7). P3.5 to P3.9 and P6.5 extend the sheet and retake
 * these baselines.
 */

skipUnlessProductionBuild();

/** Opens /dev/ui, settles it, runs `open` and compares the viewport (overlays are fixed to it). */
async function captureOpen(page: Page, name: string, open: () => Promise<void>): Promise<void> {
  await page.goto('/dev/ui');
  await settlePage(page);
  await open();
  await settlePage(page);
  await expect(page).toHaveScreenshot(`${name}.png`);
}

test.describe('UI primitives sheet', () => {
  test('dark', async ({ page }) => {
    await capture(page, '/dev/ui', 'primitives-dark');
  });

  test('light', async ({ page }) => {
    await page.goto('/dev/ui');
    await page.waitForLoadState('networkidle');
    await page.evaluate(() => document.documentElement.classList.replace('dark', 'light'));
    await expectScreen(page, 'primitives-light');
  });

  test('dialog open', async ({ page }) => {
    await captureOpen(page, 'primitives-dialog-open', () => page.getByTestId('dev-ui-dialog-open').click());
  });

  test('confirm dialog error', async ({ page }) => {
    await captureOpen(page, 'primitives-confirm-error', async () => {
      await page.getByTestId('dev-ui-confirm-error-open').click();
      await page.getByTestId('dev-ui-confirm-error-action').click();
    });
  });

  test('menu open', async ({ page }) => {
    await captureOpen(page, 'primitives-menu-open', () => page.getByTestId('dev-ui-menu-open').click());
  });

  test('error toast', async ({ page }) => {
    await captureOpen(page, 'primitives-toast-error', () => page.getByTestId('dev-ui-toast-error').click());
  });

  for (const ink of ['paper', 'marigold', 'ultramarine'] as const) {
    test(`${ink} ink panel`, async ({ page }) => {
      await page.goto('/dev/ui');
      await settlePage(page);
      await expect(page.getByTestId(`dev-ui-ink-${ink}`)).toHaveScreenshot(`primitives-ink-${ink}.png`);
    });
  }

  test('bottom sheet open in the marigold panel prints on paper', async ({ page }) => {
    await captureOpen(page, 'primitives-sheet-bottom-ink', () =>
      page.getByTestId('dev-ui-ink-marigold-sheet-open').click()
    );
  });

  test('right sheet open', async ({ page }) => {
    await captureOpen(page, 'primitives-sheet-right', () => page.getByTestId('dev-ui-sheet-right-open').click());
  });
});
