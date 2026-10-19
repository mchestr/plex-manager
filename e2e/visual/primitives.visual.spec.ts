import { capture, expectScreen, skipUnlessProductionBuild, test } from './visual-test';

/**
 * The /dev/ui primitives sheet (P3.4), the regression target for
 * components/ui: the dark theme, then the light theme by swapping the class on
 * <html>. P3.5 to P3.9 and P6.5 extend the sheet and retake these baselines.
 */

skipUnlessProductionBuild();

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
});
