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

/**
 * The desktop spread (design 4.7, P7.4): from 1024 px wide at 4:3 or wider.
 * The stage renders both chromes and this query shows one, so the switch is
 * CSS only (the `rw-spread:` variant in `app/globals.css` is the same query).
 */
export const SPREAD_QUERY = "(min-width: 1024px) and (min-aspect-ratio: 4/3)"

const SPREAD_MAX_U = 1.1
/** The top bar (brand, tabs, progress) and the margin under the artboard. */
const SPREAD_CHROME_H = 140
/** The side gutter, and each previous and next button's column beside the artboard. */
const SPREAD_GUTTER = 24
const SPREAD_NAV_W = 80

const clamp = (min: number, value: number, max: number) => Math.min(max, Math.max(min, value))

/** The contents rail and Notes widths at a window width: narrow enough at 1024 px to keep the artboard at 0.8 or more. */
export function spreadColumns(vw: number): { railW: number; notesW: number } {
  return { railW: Math.round(clamp(176, vw * 0.17, 248)), notesW: Math.round(clamp(280, vw * 0.3, 500)) }
}

/**
 * The spread's artboard scale: `min(1.1, (vh - 140) / 693, columnWidth / 390)`,
 * where the column is what the rail, the Notes, the two button columns and
 * the gutters leave. 1440 x 900 gives 1.1 and 1366 x 768 about 0.9.
 */
export function fitSpread({ vw, vh, railW, notesW }: { vw: number; vh: number; railW: number; notesW: number }): number {
  const column = vw - 2 * SPREAD_GUTTER - railW - notesW - 2 * SPREAD_NAV_W
  return Math.max(0, Math.min(SPREAD_MAX_U, (vh - SPREAD_CHROME_H) / ARTBOARD_H, column / ARTBOARD_W))
}
