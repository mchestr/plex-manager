import type { Page } from '@playwright/test';

import heavyIssue from './fixtures/rewind/heavy.v3.json';
import { expect, test, TEST_USERS } from './fixtures/auth';
import { createE2EPrismaClient } from './helpers/prisma';
import { WAIT_TIMEOUTS } from './helpers/test-utils';

/**
 * Every page of the heavy issue fits its artboard at the phone sizes of
 * Rewind design 4.7: nothing runs past the artboard's edges, so nothing sits
 * under the bottom chrome. The issue is the heavy golden fixture as P5.9's
 * pipeline would store it, seeded for the admin, plus a Guess page over its
 * top four series (the heavy member's No. 1 leads too narrowly for a quiz),
 * so every page the registry renders is checked. Autoplay is off and the
 * small-screen choice is "story", so the spec turns every page itself, below
 * the 0.8 scale floor too. Guess and Top shows are checked before and after
 * the quiz is answered.
 */

const YEAR = 2026;
const VIEWPORTS = [
  { width: 390, height: 844 },
  { width: 390, height: 664 },
  { width: 375, height: 548 },
  { width: 360, height: 640 },
];
/** Sub-pixel rounding. */
const SLACK = 1;

/** A series quiz over the issue's top four series, answer not first, placed before Top shows as the registry orders it. */
function withGuess(pages: typeof heavyIssue.pages, facts: Record<string, { display?: unknown }>) {
  const at = pages.findIndex((page) => page.type === 'top-shows');
  const rows = (pages[at].data as { rows: Array<{ key: string }> }).rows.slice(0, 4);
  const options = rows.map((row, i) => ({ key: row.key, title: String(facts[`series[${i + 1}].title`]?.display), rank: i + 1, minutes: `series[${i + 1}].minutes` }));
  const guess = { type: 'guess', data: { kind: 'series', options: [options[2], options[0], options[3], options[1]] } };
  return [...pages.slice(0, at), guess, ...pages.slice(at)];
}

/** The heavy fixture's stored v3 Rewind (`npm run rewind:e2e-fixtures`), with the Guess page added. */
function seedIssue() {
  return { ...heavyIssue, year: YEAR, pages: withGuess(heavyIssue.pages, heavyIssue.facts) };
}

interface Box {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

interface Fit {
  page: string;
  artboard: Box;
  chromeTop: number;
  content: Box | null;
  /** The elements past the artboard's edges, for the failure message. */
  outside: string[];
}

/**
 * The current page's content box: the union of every element's visible box
 * inside the artboard, each clipped by its `overflow` ancestors (so
 * screen-reader-only text counts for nothing), measured once the page's
 * entrance has finished.
 */
async function measureCurrentPage(page: Page): Promise<Fit> {
  return page.evaluate(async () => {
    const current = document.querySelector<HTMLElement>('[data-testid="rewind-page"][data-current]');
    const artboard = current?.querySelector<HTMLElement>('[data-testid="rewind-artboard"]');
    const chrome = document.querySelector<HTMLElement>('[data-testid="rewind-chrome-bottom"]');
    if (!current || !artboard || !chrome) throw new Error('No current page');

    const settle = Promise.all(current.getAnimations({ subtree: true }).map((a) => a.finished.catch(() => undefined)));
    await Promise.race([settle, new Promise((resolve) => setTimeout(resolve, 3000))]);
    await document.fonts.ready;

    const board = artboard.getBoundingClientRect();
    const clipOf = (el: Element): Box | null => {
      let box: Box = el.getBoundingClientRect();
      for (let a = el.parentElement; a && a !== artboard; a = a.parentElement) {
        const style = getComputedStyle(a);
        if (style.overflowX === 'visible' && style.overflowY === 'visible') continue;
        const r = a.getBoundingClientRect();
        box = { top: Math.max(box.top, r.top), right: Math.min(box.right, r.right), bottom: Math.min(box.bottom, r.bottom), left: Math.max(box.left, r.left) };
      }
      return box.right - box.left > 1 && box.bottom - box.top > 1 ? box : null;
    };

    let content: Box | null = null;
    const outside: string[] = [];
    for (const el of artboard.querySelectorAll('*')) {
      const style = getComputedStyle(el);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      const box = clipOf(el);
      if (!box) continue;
      content = content
        ? { top: Math.min(content.top, box.top), right: Math.max(content.right, box.right), bottom: Math.max(content.bottom, box.bottom), left: Math.min(content.left, box.left) }
        : box;
      const past = {
        top: board.top - box.top,
        right: box.right - board.right,
        bottom: box.bottom - board.bottom,
        left: board.left - box.left,
      };
      const sides = Object.entries(past).filter(([, px]) => px > 1);
      if (sides.length > 0) {
        const id = el.getAttribute('data-testid') ?? el.tagName.toLowerCase();
        outside.push(`${id} "${(el.textContent ?? '').trim().slice(0, 30)}" ${sides.map(([side, px]) => `${Math.round(px)} px past the ${side}`).join(', ')}`);
      }
    }

    return {
      page: current.getAttribute('aria-label') ?? '',
      artboard: { top: board.top, right: board.right, bottom: board.bottom, left: board.left },
      chromeTop: chrome.getBoundingClientRect().top,
      content,
      outside: outside.slice(0, 5),
    };
  });
}

test.describe('Rewind pages fit the phone', () => {
  test.beforeAll(async () => {
    const data = seedIssue();
    const prisma = createE2EPrismaClient();
    try {
      await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: YEAR } });
      await prisma.plexWrapped.create({
        data: {
          userId: TEST_USERS.ADMIN.id,
          year: YEAR,
          status: 'completed',
          dataVersion: 3,
          edition: data.edition,
          factsHash: data.factsHash,
          data: JSON.stringify(data),
          generatedAt: new Date(data.generatedAt),
        },
      });
    } finally {
      await prisma.$disconnect();
    }
  });

  test.afterAll(async () => {
    const prisma = createE2EPrismaClient();
    try {
      await prisma.plexWrapped.deleteMany({ where: { userId: TEST_USERS.ADMIN.id, year: YEAR } });
    } finally {
      await prisma.$disconnect();
    }
  });

  for (const viewport of VIEWPORTS) {
    test(`at ${viewport.width}x${viewport.height} every page stays inside its artboard, above the bottom chrome`, async ({ adminPage }) => {
      await adminPage.emulateMedia({ reducedMotion: 'reduce' });
      await adminPage.addInitScript(() => {
        window.localStorage.setItem('rewind:prefs:v1', JSON.stringify({ autoplay: false, smallScreenChoice: 'story' }));
      });
      await adminPage.setViewportSize(viewport);
      await adminPage.goto(`/rewind/${YEAR}`);
      const stage = adminPage.getByTestId('rewind-stage');
      await expect(stage.filter({ visible: true })).toBeVisible({ timeout: WAIT_TIMEOUTS.EXTENDED_OPERATION });
      // A streamed copy of the stage can sit hidden in the document until React swaps it in
      await expect(stage).toHaveCount(1);

      // The stage takes the story keys; a quiz tile keeps the arrows for itself
      const turn = async (key: 'ArrowRight' | 'ArrowLeft') => {
        await stage.focus();
        await adminPage.keyboard.press(key);
      };
      const check = async (index: number, state = '') => {
        await expect(adminPage.locator(`[data-testid="rewind-page"][data-current][data-index="${index}"]`)).toBeVisible();
        const fit = await measureCurrentPage(adminPage);
        const where = `${fit.page}${state}: ${fit.outside.join('; ')}`;
        expect(fit.content, where).not.toBeNull();
        const content = fit.content as Box;
        expect.soft(content.top, where).toBeGreaterThanOrEqual(fit.artboard.top - SLACK);
        expect.soft(content.left, where).toBeGreaterThanOrEqual(fit.artboard.left - SLACK);
        expect.soft(content.right, where).toBeLessThanOrEqual(fit.artboard.right + SLACK);
        expect.soft(content.bottom, where).toBeLessThanOrEqual(fit.artboard.bottom + SLACK);
        expect.soft(content.bottom, where).toBeLessThanOrEqual(fit.chromeTop + SLACK);
      };

      const types = seedIssue().pages.map((page) => page.type);
      await expect(adminPage.getByTestId('rewind-page')).toHaveCount(types.length);
      for (let i = 0; i < types.length; i++) {
        if (i > 0) await turn('ArrowRight');
        await check(i);
        if (types[i] !== 'guess') continue;
        // Top shows with its deck, then the answered quiz and Top shows' callback
        await turn('ArrowRight');
        await check(i + 1, ' (deck)');
        await turn('ArrowLeft');
        await adminPage.locator('[data-current] [data-testid="rewind-quiz-option-1"]').click();
        await expect(adminPage.locator('[data-current] [data-testid="rewind-quiz-reveal"]')).not.toBeEmpty();
        await check(i, ' (answered)');
      }
    });
  }
});
