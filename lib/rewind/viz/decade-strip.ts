/**
 * Taste's decade strip (design 4.3 page 07): the decades the member's titles
 * were made in, each a segment as wide as its share of the titles, with the
 * median year marked by a numeral fitted with `fitLines`.
 *
 * ```
 *                      2022
 *                        ┃
 *  ▨▨▨▨|▨▨▨▨▨▨▨▨|████████████████
 *  1990s  2010s       2020s
 * ```
 *
 * The decade holding the median year prints solid, the others hatched. A
 * segment narrower than a label leaves its label out (the Table lists every
 * decade). Pure: the font metrics are passed in, so it never reaches the
 * server-only JSON.
 *
 * @module lib/rewind/viz/decade-strip
 */

import { fitLines, type FitResult } from "@/lib/rewind/typeset/fit-lines"
import type { FontMetrics } from "@/lib/rewind/typeset/measure"

interface DecadeSegment {
  decade: number
  /** "2020s". */
  label: string
  x: number
  width: number
  /** The median year falls in it. */
  median: boolean
  /** Wide enough to print its label. */
  labelled: boolean
}

export interface DecadeStrip {
  segments: DecadeSegment[]
  /** The median year's tick and numeral; null without a median year. */
  marker: { x: number; fit: FitResult } | null
}

const LABEL_MIN = 40
const MARKER_MEASURE = 120

const r = (n: number) => Math.round(n * 100) / 100

interface StripOptions {
  width: number
  metrics: FontMetrics
}

/**
 * @example
 * ```ts
 * const strip = decadeStrip([{ decade: 2010, titles: 1 }, { decade: 2020, titles: 3 }], { year: 2022, label: "2022" }, { width: 358, metrics })
 * strip.segments.map((s) => s.width) // [89.5, 268.5]
 * strip.marker?.x                    // 156.63, inside the 2020s
 * ```
 */
export function decadeStrip(
  decades: ReadonlyArray<{ decade: number; titles: number }>,
  median: { year: number; label: string } | null,
  { width, metrics }: StripOptions
): DecadeStrip {
  const sorted = [...decades].sort((a, b) => a.decade - b.decade)
  const total = sorted.reduce((sum, d) => sum + d.titles, 0)
  const medianDecade = median ? median.year - (median.year % 10) : null
  let x = 0
  const segments = sorted.map((d) => {
    const w = total > 0 ? r((d.titles / total) * width) : 0
    const segment = { decade: d.decade, label: `${d.decade}s`, x: r(x), width: w, median: d.decade === medianDecade, labelled: w >= LABEL_MIN }
    x += w
    return segment
  })
  const home = segments.find((s) => s.median)
  if (!median || !home) return { segments, marker: null }
  const at = home.x + ((median.year - home.decade + 0.5) / 10) * home.width
  const fit = fitLines(median.label, { role: "nameplate", metrics, weight: 900, measure: MARKER_MEASURE, maxLines: 1, sizeMin: 28, sizeMax: 44, tnum: true })
  return { segments, marker: { x: r(at), fit } }
}
