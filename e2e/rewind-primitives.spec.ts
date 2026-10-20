import { expect, test, type Page } from '@playwright/test';
import { rewindInks } from '../lib/design/tokens';
import { axeFor } from './a11y/scan';

// The Rewind-ready primitives on /dev/ui (plan step P3.7, ui-design-system
// 4.4 and 5.4): in each ink panel the shared primitives print in that ink,
// popups print on paper, and nothing fails contrast.

const INKS = ['paper', 'marigold', 'ultramarine'] as const;

/** Paints a CSS colour on a canvas and reads it back as sRGB hex. */
async function hexOf(page: Page, color: string): Promise<string> {
  return page.evaluate((value) => {
    const ctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true })!;
    ctx.fillStyle = value;
    ctx.fillRect(0, 0, 1, 1);
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data;
    return `#${[r, g, b].map((n) => n.toString(16).padStart(2, '0')).join('')}`;
  }, color);
}

/** Within 1/255 per channel, as theme-contract.spec.ts compares the browser's OKLCH. */
function expectHex(actual: string, expected: string) {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = channels(actual);
  const e = channels(expected);
  expect(a.every((v, i) => Math.abs(v - e[i]) <= 1), `${actual} is within 1/255 of ${expected}`).toBe(true);
}

async function computed(page: Page, testId: string, property: 'backgroundColor' | 'color'): Promise<string> {
  const value = await page.getByTestId(testId).evaluate((el, prop) => getComputedStyle(el)[prop], property);
  return hexOf(page, value);
}

test.describe('Rewind-ready primitives on /dev/ui', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/dev/ui');
    // Until React swaps in the streamed page, a hidden copy shares its test id.
    await page.waitForLoadState('networkidle');
    await expect(page.getByTestId('dev-ui')).toHaveCount(1);
  });

  for (const ink of INKS) {
    test(`the ${ink} panel prints its ink, with no contrast failures or unknowns`, async ({ page }) => {
      const panel = `dev-ui-ink-${ink}`;
      expectHex(await computed(page, panel, 'backgroundColor'), rewindInks[ink].field.hex);
      // The solid ink Button is the ink itself, with the field as its text.
      expectHex(await computed(page, `${panel}-button`, 'backgroundColor'), rewindInks[ink].on.hex);
      expectHex(await computed(page, `${panel}-button`, 'color'), rewindInks[ink].field.hex);

      const results = await axeFor(page).include(`[data-testid="${panel}"]`).analyze();
      const contrast = (list: typeof results.violations) =>
        list.filter((r) => r.id === 'color-contrast' || r.id === 'color-contrast-enhanced');
      expect(contrast(results.violations)).toEqual([]);
      expect(contrast(results.incomplete)).toEqual([]);
      expect(results.violations).toEqual([]);
    });
  }

  test('a sheet opened in the marigold panel prints on paper inside the scope', async ({ page }) => {
    await page.getByTestId('dev-ui-ink-marigold-sheet-open').click();
    const sheet = page.getByTestId('dev-ui-ink-marigold-sheet-content');
    await expect(sheet).toBeVisible();
    await expect(sheet).toHaveAttribute('data-field', 'paper');
    expect(await sheet.evaluate((el) => el.closest('[data-theme="rewind"]') !== null)).toBe(true);
    expectHex(await computed(page, 'dev-ui-ink-marigold-sheet-content', 'backgroundColor'), rewindInks.paper.field.hex);

    // The segmented control inside prints in paper's ink: the selection is solid ink.
    const selected = sheet.getByRole('radio', { name: 'Story' });
    const fill = await selected.evaluate((el) => getComputedStyle(el).backgroundColor);
    expectHex(await hexOf(page, fill), rewindInks.paper.on.hex);

    const results = await axeFor(page).include('[data-testid="dev-ui-ink-marigold-sheet-content"]').analyze();
    expect(results.violations).toEqual([]);
    await page.keyboard.press('Escape');
    await expect(sheet).toHaveCount(0);
    await expect(page.getByTestId('dev-ui-ink-marigold-sheet-open')).toBeFocused();
  });

  test('a toast raised in an ink panel prints on paper', async ({ page }) => {
    await page.getByTestId('dev-ui-ink-ultramarine-toast').click();
    const toast = page.getByTestId('toast').filter({ hasText: 'Card saved' });
    await expect(toast).toHaveAttribute('data-field', 'paper');
    const fill = await toast.evaluate((el) => getComputedStyle(el).backgroundColor);
    expectHex(await hexOf(page, fill), rewindInks.paper.field.hex);
  });

  test('the slider speaks its month as the keyboard moves it', async ({ page }) => {
    const thumb = page.getByTestId('dev-ui-slider').getByRole('slider', { name: 'Month' });
    await thumb.focus();
    await expect(thumb).toHaveAttribute('aria-valuetext', 'August');
    await page.keyboard.press('ArrowRight');
    await expect(thumb).toHaveAttribute('aria-valuetext', 'September');
    await page.keyboard.press('Home');
    await expect(thumb).toHaveAttribute('aria-valuetext', 'January');
  });

  test('the bottom sheet is full width at the bottom of a phone screen', async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.getByTestId('dev-ui-sheet-bottom-open').click();
    const sheet = page.getByTestId('dev-ui-sheet-bottom-content');
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box && { width: box.width, bottom: Math.round(box.y + box.height) };
      })
      .toEqual({ width: 390, bottom: 844 });
  });

  test('the right sheet is 420px wide and full height on desktop', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.getByTestId('dev-ui-sheet-right-open').click();
    const sheet = page.getByTestId('dev-ui-sheet-right-content');
    await expect
      .poll(async () => {
        const box = await sheet.boundingBox();
        return box && { x: Math.round(box.x), width: box.width, height: box.height };
      })
      .toEqual({ x: 1020, width: 420, height: 900 });
  });
});
