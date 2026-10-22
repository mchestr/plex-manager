/**
 * Warms a veiled page's visible style in idle time, so the turn onto it does
 * not compute it cold.
 *
 * A story page's neighbours wait `invisible` (`visibility: hidden`) under the
 * current page (`components/rewind/stage/stage-page.tsx`). Unveiling one
 * restyles its whole subtree, and Chrome computes a subtree's first visible
 * style at more than twice the cost of a later one, so a turn onto a big page
 * (the light issue's centrefold, about 360 elements) paid it in the turn's
 * frame and broke the 50 ms long-task gate (`e2e/perf/rewind.perf.spec.ts`).
 *
 * `warmVisibleStyle` drops `invisible`, reads a computed style (which styles
 * the page as visible), and puts `invisible` back before the task ends. No
 * frame renders in between, so the page is never painted, hit-tested or
 * exposed to assistive technology, and React's `className` is unchanged.
 *
 * @module lib/rewind/stage/warm-style
 */

const VEIL = "invisible"

/** Styles `page` once as visible and veils it again; a page that is not veiled is left alone. */
export function warmVisibleStyle(page: HTMLElement): void {
  if (!page.classList.contains(VEIL)) return
  page.classList.remove(VEIL)
  void getComputedStyle(page).visibility
  page.classList.add(VEIL)
}
