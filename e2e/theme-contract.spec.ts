import { expect, test, type Page } from '@playwright/test';

// The token file and the Rewind scope contract (plan step P3.1,
// ui-design-system 4.1 and 4.4), checked in the browser that renders them.

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

/** Injects a Rewind scope root holding one ink field, and returns the span's computed text and fill. */
async function inkSample(page: Page, ink: string, scheme: 'light' | 'dark') {
  const { color, background } = await page.evaluate(
    ([field, cls]) => {
      document.querySelector('[data-testid="theme-contract-fixture"]')?.remove();
      const root = document.createElement('div');
      root.dataset.theme = 'rewind';
      root.dataset.testid = 'theme-contract-fixture';
      root.innerHTML = `<section data-field="${field}" class="${cls}"><span style="color: var(--foreground); background: var(--background)">Ink</span></section>`;
      document.body.append(root);
      const style = getComputedStyle(root.querySelector('span')!);
      return { color: style.color, background: style.backgroundColor };
    },
    [ink, scheme] as const,
  );
  return { color: await hexOf(page, color), background: await hexOf(page, background) };
}

/**
 * The browser's OKLCH-to-sRGB conversion can round one channel the other way
 * from the measured sheets, so hex is compared within 1/255 per channel, as
 * P3.3's sync test does.
 */
function expectHex(actual: string, expected: string) {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = channels(actual);
  const e = channels(expected);
  expect(a.every((v, i) => Math.abs(v - e[i]) <= 1), `${actual} is within 1/255 of ${expected}`).toBe(true);
}

async function expectInk(page: Page, ink: string, scheme: 'light' | 'dark', color: string, background: string) {
  const sample = await inkSample(page, ink, scheme);
  expectHex(sample.color, color);
  expectHex(sample.background, background);
}

test.describe('Theme contract', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
  });

  test('the html element carries dark and the body paints the graphite canvas', async ({ page }) => {
    await expect(page.locator('html')).toHaveClass(/\bdark\b/);
    const background = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expectHex(await hexOf(page, background), '#1a1c1e');
  });

  test('window.scrollTo scrolls the document, not the body', async ({ page }) => {
    const scrolled = await page.evaluate(() => {
      const spacer = document.createElement('div');
      spacer.style.height = '3000px';
      document.body.append(spacer);
      window.scrollTo(0, 400);
      return {
        isHtml: document.scrollingElement === document.documentElement,
        top: document.scrollingElement?.scrollTop,
        scrollY: window.scrollY,
      };
    });
    expect(scrolled).toEqual({ isHtml: true, top: 400, scrollY: 400 });
  });

  test('a light ink prints its own ink on its field inside the Rewind scope', async ({ page }) => {
    await expectInk(page, 'marigold', 'light', '#1f1306', '#feb644');
  });

  test('a dark ink prints paper on its field inside the Rewind scope', async ({ page }) => {
    await expectInk(page, 'ultramarine', 'dark', '#f1eadc', '#2238b8');
  });
});
