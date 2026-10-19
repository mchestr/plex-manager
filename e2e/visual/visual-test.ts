import type { Page } from '@playwright/test';
import { expect, test as sessionTest } from '../fixtures/session';
import { makeDeterministic, settle } from '../helpers/deterministic';

/**
 * The `test` every visual spec uses: a deterministic page (seeded
 * `Math.random`, paused fake clock, reduced motion) plus the minted-session
 * `signIn` fixture.
 */
export const test = sessionTest.extend({
  page: async ({ page }, use) => {
    await makeDeterministic(page);
    await use(page);
  },
});

/**
 * Call at the top of every visual spec file (a module-level call here would
 * run once per worker, not once per file): baselines are compared only
 * against a production build.
 */
export function skipUnlessProductionBuild(): void {
  test.skip(
    process.env.E2E_SERVER !== 'prod',
    'Visual baselines are compared only against a production build: run with E2E_SERVER=prod.'
  );
}

export { expect };

/**
 * Lets the page finish. Each pass waits for the network, runs the paused
 * clock (timers, animation frames, TanStack Query's `setTimeout` notify) and
 * then finishes every finite Web Animation: framer-motion runs opacity and
 * transform on WAAPI, which keeps real time, and an `AnimatePresence` exit
 * would otherwise still be running when the clock stops.
 */
export async function settlePage(page: Page): Promise<void> {
  for (let pass = 0; pass < 3; pass++) {
    await page.waitForLoadState('networkidle');
    await settle(page);
    await page.evaluate(() => {
      for (const animation of document.getAnimations()) {
        const iterations = animation.effect?.getComputedTiming().iterations;
        if (animation.playState === 'running' && iterations !== Infinity) {
          animation.finish();
        }
      }
    });
  }
}

/**
 * Opens `path`, settles it and compares a full-page screenshot to
 * `<name>.png`, with every `*-timestamp` test id masked.
 */
export async function capture(page: Page, path: string, name: string): Promise<void> {
  await page.goto(path);
  await expectScreen(page, name);
}

/** Settles the current page and compares it to `<name>.png`. */
export async function expectScreen(page: Page, name: string): Promise<void> {
  await settlePage(page);
  await expect(page).toHaveScreenshot(`${name}.png`, {
    fullPage: true,
    mask: [page.getByTestId(/-timestamp$/)],
  });
}
