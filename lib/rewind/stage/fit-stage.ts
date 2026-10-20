/**
 * Fits the 390 x 693 story artboard to the viewport (Rewind design 4.7).
 *
 * The chrome is drawn in CSS pixels outside the scaled artboard. It is roomy
 * (76 px top, 75 px bottom) unless the artboard would then scale under 1, when
 * it compacts to 52 px top and 52 px plus the bottom safe area. The scale is
 *
 *   u = min(vw / 390, (vh - chrome) / 693), capped at 1.4
 *
 * When something other than the height limits `u` (the width or the cap), the
 * artboard grows taller, to at most 845 logical px, so the extra height goes
 * to the page's flexible gaps instead of the letterbox.
 *
 * @module lib/rewind/stage/fit-stage
 */

const ARTBOARD_W = 390
const ARTBOARD_H = 693
const ARTBOARD_MAX_H = 845
const MAX_U = 1.4
/** Story mode runs at this scale or more; below it P5.3 offers article mode. */
const FLOOR_U = 0.8
/** 130% of a 16 px root: P5.3 offers article mode above it. */
const LARGE_TEXT_PX = 20.8

const ROOMY = { top: 76, bottom: 75 }
const COMPACT = { top: 52, bottom: 52 }

export interface FitInput {
  vw: number
  vh: number
  /** `env(safe-area-inset-bottom)` in px. */
  safeBottom: number
  rootFontPx: number
}

export interface StageFit {
  chrome: { variant: "roomy" | "compact"; top: number; bottom: number }
  u: number
  /** Logical artboard height, 693 to 845. */
  artboardH: number
  belowFloor: boolean
  largeText: boolean
}

function scale(vw: number, vh: number, chromeH: number) {
  const byHeight = (vh - chromeH) / ARTBOARD_H
  return { byHeight, u: Math.max(0, Math.min(vw / ARTBOARD_W, byHeight, MAX_U)) }
}

/** The chrome, scale and artboard height for one viewport (390 x 664 gives compact chrome at 0.81). */
export function fitStage({ vw, vh, safeBottom, rootFontPx }: FitInput): StageFit {
  const roomy = scale(vw, vh, ROOMY.top + ROOMY.bottom)
  const compact = roomy.u < 1
  const chrome = compact
    ? { variant: "compact" as const, top: COMPACT.top, bottom: COMPACT.bottom + safeBottom }
    : { variant: "roomy" as const, ...ROOMY }
  const { byHeight, u } = compact ? scale(vw, vh, chrome.top + chrome.bottom) : roomy
  const artboardH = u > 0 && u < byHeight ? Math.min(ARTBOARD_MAX_H, (vh - chrome.top - chrome.bottom) / u) : ARTBOARD_H

  return { chrome, u, artboardH, belowFloor: u < FLOOR_U, largeText: rootFontPx > LARGE_TEXT_PX }
}
