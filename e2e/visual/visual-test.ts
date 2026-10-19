import type { Page, Request } from '@playwright/test';
import { expect, test as sessionTest } from '../fixtures/session';
import { makeDeterministic, settle } from '../helpers/deterministic';

/**
 * The `test` every visual spec uses: a deterministic page (seeded
 * `Math.random`, paused fake clock, reduced motion) plus the minted-session
 * `signIn` fixture.
 */
export const test = sessionTest.extend({
  page: async ({ page }, use) => {
    trackRequests(page);
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
 * Lets the page finish. Each pass waits until no request is in flight
 * (including ones a click or a timer started after load), runs the paused
 * clock (timers, animation frames, TanStack Query's `setTimeout` notify) and
 * then finishes every finite Web Animation: Motion runs opacity and
 * transform on WAAPI, which keeps real time, and an `AnimatePresence` exit
 * would otherwise still be running when the clock stops.
 *
 * Motion 14 runs transforms on the compositor and commits their final style
 * only once its own clock, here the paused one, passes their end; and a
 * finished exit mounts the next child in real time, whose entrance is another
 * WAAPI animation. So the page then gets moments of real time, each followed
 * by a second of the clock (not a full settle, which would fire timers such
 * as a slideshow's), until no finite animation is left.
 */
export async function settlePage(page: Page): Promise<void> {
  for (let pass = 0; pass < 3; pass++) {
    await waitForNetworkQuiet(page);
    await settle(page);
    await finishAnimations(page);
  }
  for (let pass = 0; pass < MAX_COMMIT_PASSES; pass++) {
    await page.waitForTimeout(REAL_TIME_MS);
    await settle(page, COMMIT_CLOCK_MS);
    if ((await finishAnimations(page)) === 0) return;
  }
}

/** The requests each page has in flight, kept by {@link trackRequests}. */
const inflight = new WeakMap<Page, Set<Request>>();

/** Starts counting `page`'s requests in flight; call before its first `goto`. */
function trackRequests(page: Page): void {
  const requests = new Set<Request>();
  inflight.set(page, requests);
  const done = (request: Request) => requests.delete(request);
  page.on('request', (request) => requests.add(request));
  page.on('requestfinished', done);
  page.on('requestfailed', done);
}

/**
 * Waits until `page` has had no request in flight for {@link QUIET_MS}.
 *
 * Playwright's `networkidle` fires once per navigation and then stays fired,
 * so it never waits for a request that starts later: a Server Action that a
 * click or a timer sends (the create-invite dialog's library fetch) would
 * otherwise resolve mid-scan, and its error toast would land in some scans
 * and not others.
 */
async function waitForNetworkQuiet(page: Page): Promise<void> {
  await page.waitForLoadState('networkidle');
  const requests = inflight.get(page);
  if (!requests) throw new Error('settlePage needs the `page` fixture of e2e/visual/visual-test.ts.');
  const deadline = Date.now() + QUIET_TIMEOUT_MS;
  let quietSince = Date.now();
  for (;;) {
    if (requests.size > 0) quietSince = Date.now();
    else if (Date.now() - quietSince >= QUIET_MS) return;
    if (Date.now() > deadline) {
      const urls = [...requests].map((request) => request.url()).join(', ');
      throw new Error(`Requests still in flight after ${QUIET_TIMEOUT_MS} ms: ${urls}`);
    }
    await page.waitForTimeout(POLL_MS);
  }
}

/** Quiet time that counts as idle, as Playwright's `networkidle` uses. */
const QUIET_MS = 500;
const QUIET_TIMEOUT_MS = 15_000;
const POLL_MS = 50;

/**
 * Finishes every running finite Web Animation. Returns how many finite
 * script animations (Motion's, not CSS transitions or animations) are left,
 * running or finished but not yet committed and removed.
 */
function finishAnimations(page: Page): Promise<number> {
  return page.evaluate(() => {
    let count = 0;
    for (const animation of document.getAnimations()) {
      const iterations = animation.effect?.getComputedTiming().iterations;
      if (iterations === Infinity) continue;
      if (animation.playState === 'running') animation.finish();
      if (!(animation instanceof CSSTransition || animation instanceof CSSAnimation)) count++;
    }
    return count;
  });
}

const MAX_COMMIT_PASSES = 3;
/** Real time for WAAPI animations to finish and fire their events. */
const REAL_TIME_MS = 1000;
/** Clock time past the end of the longest entrance. */
const COMMIT_CLOCK_MS = 1000;

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
