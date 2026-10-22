/**
 * A chart's text summary (ui-design-system 3.5, P10.9): one or two sentences
 * that say what the chart shows, for its `aria-describedby` and an sr-only
 * caption beside "View as table".
 *
 * - Day axis: the total over the range, then the peak day and how the last
 *   day compares with the first. One day reads as that day's value.
 * - Category axis: the leading category and its share of the total.
 * - More than one series adds each series' total in brackets.
 * - Nothing above zero reads "No activity in this period."
 *
 * @example
 * ```ts
 * summarize(
 *   { kind: "bar", x: { type: "day", keys: ["2026-10-16", "2026-10-17"] },
 *     series: [{ id: "cost", label: "Cost", values: [0.5, 1.25] }], format: "money" },
 *   f, // bindFormat({ locale: "en-US", timeZone: "UTC" })
 * )
 * // "$1.75 in total from Oct 16, 2026 to Oct 17, 2026. The peak was $1.25 on
 * //  Oct 17, 2026, and the last day ($1.25) was up from the first ($0.500)."
 * ```
 *
 * @module lib/charts/summary
 */

import { axisLabels, foldSeries, formatValue, pointCount, type ChartSpec } from "@/components/ui/chart-card/chart-spec"
import type { BoundFormat } from "@/lib/utils/format"

const sum = (values: readonly number[]) => values.reduce((total, value) => total + value, 0)

export function summarize(spec: ChartSpec, f: BoundFormat): string {
  const series = foldSeries(spec.series)
  const points = pointCount(spec.x)
  const totals = Array.from({ length: points }, (_, index) => sum(series.map((item) => item.values[index] ?? 0)))
  const total = sum(totals)
  if (points === 0 || total === 0) return "No activity in this period."

  const value = (n: number) => formatValue(n, spec.format, f)
  const labels = axisLabels(spec.x, f, "table")
  const peak = totals.indexOf(Math.max(...totals))
  const split = series.length > 1 ? ` (${series.map((item) => `${item.label} ${value(sum(item.values))}`).join(", ")})` : ""

  if (spec.x.type === "category") {
    const noun = points === 1 ? "category" : "categories"
    return `${labels[peak]} leads with ${value(totals[peak])} of ${value(total)} across ${f.number(points)} ${noun}${split}.`
  }
  if (points === 1) return `${value(total)} on ${labels[0]}${split}.`

  const first = totals[0]
  const last = totals[points - 1]
  const change = last > first ? "up from" : last < first ? "down from" : "level with"
  return (
    `${value(total)} in total from ${labels[0]} to ${labels[points - 1]}${split}. ` +
    `The peak was ${value(totals[peak])} on ${labels[peak]}, and the last day (${value(last)}) was ${change} the first (${value(first)}).`
  )
}
