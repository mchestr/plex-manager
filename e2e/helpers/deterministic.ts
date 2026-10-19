import type { Page } from '@playwright/test';

/**
 * Browser-side determinism for screenshot specs (visual and axe).
 *
 * The server clock is not frozen: seeds use offsets from seed time, so
 * relative copy such as "3 days ago" stays stable while absolute dates are
 * masked (`data-testid` ending in `-timestamp`, or `[data-visual-mask]`).
 *
 * @module e2e/helpers/deterministic
 */

/** The browser's wall clock for every screenshot. */
export const VISUAL_NOW = new Date('2026-10-19T12:00:00Z');

/** Seed for the page's `Math.random`. */
export const VISUAL_SEED = 20261019;

/** Fake time run after load, so framer-motion entrances finish. */
export const SETTLE_MS = 5000;

/**
 * The mulberry32 generator: a fixed sequence in [0, 1) for a given seed.
 *
 * Self-contained (no outer references) because its source is injected into
 * the page by {@link makeDeterministic}.
 *
 * @example
 * ```ts
 * const random = mulberry32(1)
 * random() // => 0.6270739405881613
 * random() // => 0.002735721180215478
 * ```
 */
export function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Prepares a page before its first `goto`: seeded `Math.random`, reduced
 * motion, and a fake clock paused at {@link VISUAL_NOW}.
 *
 * With the clock paused, no timer or animation frame runs until
 * {@link settle} advances it, so loops always stop at the same phase however
 * long the page took to load.
 */
export async function makeDeterministic(page: Page): Promise<void> {
  await page.addInitScript({
    content: `Math.random = (${mulberry32.toString()})(${VISUAL_SEED});`,
  });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  // Install a minute early: the installed clock ticks in real time, so
  // pausing at the install time itself can land in the past and throw.
  // Nothing is loaded yet, so no timer fires on the way to VISUAL_NOW.
  await page.clock.install({ time: new Date(VISUAL_NOW.getTime() - 60_000) });
  await page.clock.pauseAt(VISUAL_NOW);
}

/** Runs the paused clock forward by `ms` (default {@link SETTLE_MS}). */
export async function settle(page: Page, ms: number = SETTLE_MS): Promise<void> {
  await page.clock.runFor(ms);
}
