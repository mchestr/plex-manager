import type { Page } from '@playwright/test';

import { chooseCut, currentPageInfo, disableAutoplay, openStage, pageCount, turnForward } from '../helpers/rewind-stage';
import { clearRewindSeed, REWIND_MEMBERS, seedRewind } from '../helpers/seed-rewind';
import { expect, settlePage, test } from '../visual/visual-test';

/**
 * Forced colours (P7.15, design 11.1), on every page of the heavy issue in
 * `rewind-a11y-chromium` (Playwright emulates `forced-colors` on chromium
 * only). Under `forced-colors: active`:
 *
 * - each page's field maps to `Canvas` and its ink to `CanvasText`;
 * - hatching still draws (`.rw-hatch` has an image, SVG hatches are
 *   `currentColor` patterns), solid marks (`.bg-current`) fill with
 *   `CanvasText`, and no visible data mark or outline takes the `Canvas`
 *   colour, which would hide it;
 * - the focus ring stays visible on the Settings button.
 *
 * The screenshots of the same pages are in `e2e/visual/rewind-forced-colors.spec.ts`,
 * with the other Rewind baselines (advisory, refreshed by the Visual Baselines workflow).
 */

interface ForcedColorsReport {
  field: string;
  ink: string;
  canvas: string;
  canvasText: string;
  bareHatches: string[];
  hiddenMarks: string[];
}

function inspectCurrentPage(page: Page): Promise<ForcedColorsReport> {
  return page.evaluate(() => {
    const probe = document.createElement('div');
    probe.style.cssText = 'forced-color-adjust: none; background-color: Canvas; color: CanvasText;';
    document.body.append(probe);
    const canvas = getComputedStyle(probe).backgroundColor;
    const canvasText = getComputedStyle(probe).color;
    probe.remove();

    const current = document.querySelector('[data-testid="rewind-page"][data-current]')!;
    const field = current.closest('[data-field]') ?? current.querySelector('[data-field]') ?? current;
    const shown = (el: Element) => {
      const rect = el.getBoundingClientRect();
      return rect.width > 0 && rect.height > 0 && getComputedStyle(el).visibility !== 'hidden';
    };
    const label = (el: Element) => el.getAttribute('data-testid') ?? `${el.tagName.toLowerCase()}.${String(el.getAttribute('class') ?? '').split(' ')[0]}`;

    const bareHatches = [...current.querySelectorAll('.rw-hatch')].filter((el) => shown(el) && getComputedStyle(el).backgroundImage === 'none').map(label);
    const hiddenMarks: string[] = [];
    for (const el of current.querySelectorAll('.bg-current')) {
      if (shown(el) && getComputedStyle(el).backgroundColor !== canvasText) hiddenMarks.push(`${label(el)} solid fill`);
    }
    for (const el of current.querySelectorAll('path, rect, circle, line, polyline, polygon')) {
      if (!shown(el)) continue;
      const style = getComputedStyle(el);
      if (style.fill !== 'none' && style.fill === canvas && style.stroke === 'none') hiddenMarks.push(`${label(el)} fill`);
      if (style.stroke !== 'none' && style.stroke === canvas && style.fill === 'none') hiddenMarks.push(`${label(el)} stroke`);
    }
    for (const el of current.querySelectorAll('*')) {
      if (!shown(el)) continue;
      const style = getComputedStyle(el);
      if (style.outlineStyle !== 'none' && parseFloat(style.outlineWidth) > 0 && style.outlineColor === canvas) hiddenMarks.push(`${label(el)} outline`);
    }
    const fieldStyle = getComputedStyle(field);
    return { field: fieldStyle.backgroundColor, ink: fieldStyle.color, canvas, canvasText, bareHatches, hiddenMarks };
  });
}

test.describe('Rewind under forced colours', () => {
  test.beforeAll(seedRewind);
  test.afterAll(clearRewindSeed);

  test('every page of the heavy issue', async ({ page, signIn, browserName }) => {
    test.skip(browserName !== 'chromium', 'Playwright emulates forced colours on chromium only');
    test.setTimeout(180_000);
    await disableAutoplay(page);
    await page.emulateMedia({ forcedColors: 'active' });
    await signIn(REWIND_MEMBERS.heavy.id);
    await openStage(page, { settle: settlePage });

    const total = await pageCount(page);
    for (let i = 0; i < total; i++) {
      if (i === 1) await chooseCut(page);
      else if (i > 1) await turnForward(page);
      await settlePage(page);
      const { type } = await currentPageInfo(page);
      const where = `page ${i + 1} (${type})`;

      const report = await inspectCurrentPage(page);
      expect.soft(report.field, `${where}: the field is Canvas`).toBe(report.canvas);
      expect.soft(report.ink, `${where}: the ink is CanvasText`).toBe(report.canvasText);
      expect.soft(report.bareHatches, `${where}: hatching without lines`).toEqual([]);
      expect.soft(report.hiddenMarks, `${where}: marks drawn in Canvas`).toEqual([]);

      const settings = page.getByTestId('rewind-settings');
      await settings.focus();
      const ring = await settings.evaluate((el) => {
        const style = getComputedStyle(el);
        return { visible: el.matches(':focus-visible'), style: style.outlineStyle, width: parseFloat(style.outlineWidth) };
      });
      expect.soft(ring.visible && ring.style !== 'none' && ring.width >= 2, `${where}: the focus ring shows (${JSON.stringify(ring)})`).toBe(true);
      await page.getByTestId('rewind-stage').focus();
    }
  });
});
