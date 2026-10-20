/**
 * The shelf (design 5.3): the Curator's, the Comfort Rewatcher's and the
 * Festival Juror's evidence graphic. Titles stand as spines on one shelf,
 * each title set along its spine by the typesetter, so it is never broken
 * inside a word, and a rewatch carries its "x2" mark at the foot.
 *
 * ```
 *  ┌─┐┌──┐ ┌─┐┌─┐
 *  │S││D │ │A││T│   titles read bottom to top
 *  │e││u │ │r││h│
 *  │v││n │┌┘ ││e│
 *  └─┘└x2┘└──┘└─┘
 *  ══════════════   the shelf
 * ```
 *
 * Spine heights step down by a fixed rhythm so the row reads as books, not
 * bars; they carry no data. Pure: the caller passes the font metrics.
 *
 * @module lib/rewind/viz/shelf
 */

import type { FontMetrics } from "@/lib/rewind/typeset/measure"
import { fitLines, type FitResult } from "@/lib/rewind/typeset/fit-lines"

export interface Spine {
  x: number
  width: number
  height: number
  /** The title along the spine: one line, measured against the spine's height. */
  fit: FitResult
  mark: string | null
}

const GAP = 4
const PAD = 10
const RHYTHM = [1, 0.86, 0.94, 0.8, 0.97, 0.9, 0.84, 1]
const r = (n: number) => Math.round(n * 100) / 100

export function shelf(
  titles: ReadonlyArray<{ title: string; mark: string | null }>,
  { width, height, metrics }: { width: number; height: number; metrics: FontMetrics }
): Spine[] {
  const n = titles.length
  if (n === 0) return []
  const spine = (width - GAP * (n - 1)) / n
  return titles.map(({ title, mark }, i) => {
    const h = r(height * RHYTHM[i % RHYTHM.length])
    const fit = fitLines(title, {
      role: "nameplate",
      metrics,
      weight: 850,
      measure: h - PAD * 2 - (mark ? PAD * 2 : 0),
      maxLines: 1,
      sizeMin: 10,
      sizeMax: Math.min(28, spine * 0.62),
    })
    return { x: r(i * (spine + GAP)), width: r(spine), height: h, fit, mark }
  })
}
