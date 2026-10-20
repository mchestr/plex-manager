/**
 * Classifies a press on the story artboard from its pointer samples
 * (Rewind design 4.6). Pure, so the thresholds are tested without a DOM.
 *
 * - Tap: under 250 ms and under 10 px of travel. The left 30% of the width
 *   goes back, the rest forward.
 * - Swipe: mostly horizontal, 48 px or more, or 0.3 px/ms or faster once it
 *   has left the tap slop. Left is the next page.
 * - Swipe down: mostly vertical, 96 px or more, closes the story.
 * - Hold: 250 ms or more without leaving the tap slop. It hides the chrome
 *   and pauses while held, so its release does nothing more.
 *
 * Presses that start on the chrome or inside `[data-rw-interactive]` never
 * reach the classifier (`origin` says where they began). A long press on Pause
 * is the chrome's own gesture: `pausePress` decides it.
 *
 * @module lib/rewind/stage/gestures
 */

export interface PointerSample {
  x: number
  y: number
  /** ms */
  t: number
}

export type PressOrigin = "artboard" | "chrome" | "interactive"

export type Gesture =
  | { kind: "tap"; direction: "back" | "forward" }
  | { kind: "swipe"; direction: "back" | "forward" }
  | { kind: "close" }
  | { kind: "hold" }
  | { kind: "none" }

export const HOLD_MS = 250
const PAUSE_LONG_PRESS_MS = 500
const TAP_SLOP_PX = 10
const BACK_ZONE = 0.3
const SWIPE_PX = 48
const SWIPE_PX_PER_MS = 0.3
const CLOSE_PX = 96

const NONE: Gesture = { kind: "none" }

/** Whether a press that is still down has become a hold. */
export function isHold(samples: readonly PointerSample[], now: number): boolean {
  const [first] = samples
  if (!first || now - first.t < HOLD_MS) return false
  return samples.every((s) => Math.hypot(s.x - first.x, s.y - first.y) < TAP_SLOP_PX)
}

/** The gesture a finished press made; `width` is the artboard's rendered width. */
export function classifyPress(samples: readonly PointerSample[], width: number, origin: PressOrigin): Gesture {
  const first = samples[0]
  const last = samples[samples.length - 1]
  if (origin !== "artboard" || !first || !last) return NONE

  const dx = last.x - first.x
  const dy = last.y - first.y
  const dt = Math.max(1, last.t - first.t)

  if (isHold(samples, last.t)) return { kind: "hold" }
  if (Math.hypot(dx, dy) < TAP_SLOP_PX) {
    return { kind: "tap", direction: first.x < width * BACK_ZONE ? "back" : "forward" }
  }
  if (Math.abs(dx) > Math.abs(dy)) {
    if (Math.abs(dx) >= SWIPE_PX || Math.abs(dx) / dt >= SWIPE_PX_PER_MS) {
      return { kind: "swipe", direction: dx < 0 ? "forward" : "back" }
    }
    return NONE
  }
  return dy >= CLOSE_PX ? { kind: "close" } : NONE
}

/** A press on Pause: a click toggles it, a 500 ms long press opens Settings instead. */
export function pausePress(durationMs: number): "toggle" | "settings" {
  return durationMs >= PAUSE_LONG_PRESS_MS ? "settings" : "toggle"
}
