/**
 * First tap completes a count-up (P8.3, design 4.6, FR-15): a forward tap
 * on a page whose entrance is still running lands it instead of turning the
 * page, so the next tap turns it.
 *
 * The page's count-ups and stretches (the odometer's rise, the nameplate,
 * the road's pops) are CSS and WAAPI animations, so the page `article`'s
 * `getAnimations({ subtree: true })` finds them all. The story progress
 * bar (`.rw-progress`) is the dwell itself and is never finished, and an
 * animation with no end is left alone.
 *
 * @module lib/rewind/stage/running-animations
 */

/** The element an animation runs on, when it runs on one. */
function targetOf(animation: Animation): Element | null {
  const effect = animation.effect as (AnimationEffect & { target?: Element | null }) | null
  return effect?.target ?? null
}

/** Whether `animation` is still running and can be finished. */
function finishable(animation: Animation): boolean {
  if (animation.playState !== "running") return false
  if (targetOf(animation)?.closest(".rw-progress")) return false
  const end = animation.effect?.getComputedTiming().endTime
  return typeof end === "number" && Number.isFinite(end)
}

/**
 * Finishes every running animation on `page`, and says whether there was
 * one; the stage then stops the tap there instead of turning the page.
 */
export function completeRunning(page: Element | null | undefined): boolean {
  if (!page || typeof page.getAnimations !== "function") return false
  const running = page.getAnimations({ subtree: true }).filter(finishable)
  running.forEach((animation) => animation.finish())
  return running.length > 0
}
