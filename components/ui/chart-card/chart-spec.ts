/**
 * The declarative chart spec ChartCard draws (ui-design-system 3.5, UI-24).
 *
 * Pages build a `ChartSpec` from their data and never pass library options,
 * so the body that draws it (Chart.js now, Recharts in P10.9) can change
 * without touching a page. Pure and serialisable: a Server Component builds
 * the spec and hands it to the client card.
 *
 * - `bar`: one or more series over the x values, side by side.
 * - `stacked-bar`: the series stacked per x value (success and failed).
 * - `line`: a trend; daily data stays `bar`, with no invented curve.
 * - `ranked-bar`: one series over categories, largest first, horizontal.
 *
 * Series keep their slot order (`chart-1` first) and are never recoloured by
 * rank; past five, the rest fold into "Other".
 *
 * @module components/ui/chart-card/chart-spec
 */

import type { BoundFormat } from "@/lib/utils/format"

type ChartKind = "bar" | "line" | "stacked-bar" | "ranked-bar"

/** How values print in ticks, tooltips and the table. */
export type ChartValueFormat = "number" | "money" | "tokens"

export interface ChartSeries {
  id: string
  label: string
  /** One value per x value, in the same order. */
  values: number[]
}

export type ChartAxis =
  /** `YYYY-MM-DD` keys in the server zone, every day of the window (`lib/utils/day-window.ts`). */
  | { type: "day"; keys: string[] }
  | { type: "category"; labels: string[] }

export interface ChartSpec {
  kind: ChartKind
  x: ChartAxis
  series: ChartSeries[]
  format: ChartValueFormat
}

const MAX_SERIES = 5

/** At most five series: the sixth and later sum into one "Other" series. */
export function foldSeries(series: readonly ChartSeries[]): ChartSeries[] {
  if (series.length <= MAX_SERIES) return [...series]
  const kept = series.slice(0, MAX_SERIES - 1)
  const rest = series.slice(MAX_SERIES - 1)
  const values = rest[0].values.map((_, index) => rest.reduce((sum, item) => sum + (item.values[index] ?? 0), 0))
  return [...kept, { id: "other", label: "Other", values }]
}

/** Each x value's label: day keys through `formatDayKey`, never `new Date(key)`. */
export function axisLabels(axis: ChartAxis, f: BoundFormat, style: "axis" | "table" = "axis"): string[] {
  if (axis.type === "category") return axis.labels
  return axis.keys.map((key) => f.dayKey(key, style === "axis" ? "day-month-short" : "short"))
}

/** A value in the spec's format. */
export function formatValue(value: number, format: ChartValueFormat, f: BoundFormat): string {
  if (format === "money") return f.money(value)
  if (format === "tokens") return f.tokens(value)
  return f.number(value)
}

/** The number of x values. */
export function pointCount(axis: ChartAxis): number {
  return axis.type === "day" ? axis.keys.length : axis.labels.length
}

interface RankedRow {
  label: string
  value: number
}

/**
 * A ranked bar spec from labelled values: largest first, the top `limit`
 * kept and the rest summed into "Other". Server pages import it from this
 * module, not from the client `chart-card.tsx`.
 */
export function rankedSpec(
  rows: readonly RankedRow[],
  { series, format, limit = 10 }: { series: string; format: ChartValueFormat; limit?: number },
): ChartSpec {
  const sorted = [...rows].sort((a, b) => b.value - a.value)
  const kept = sorted.length > limit ? sorted.slice(0, limit - 1) : sorted
  const rest = sorted.slice(kept.length)
  const shown = rest.length > 0 ? [...kept, { label: "Other", value: rest.reduce((sum, row) => sum + row.value, 0) }] : kept
  return {
    kind: "ranked-bar",
    x: { type: "category", labels: shown.map((row) => row.label) },
    series: [{ id: "value", label: series, values: shown.map((row) => row.value) }],
    format,
  }
}

/** A ranked spec's rows, largest first; other kinds keep their x order. */
export function orderedSpec(spec: ChartSpec): ChartSpec {
  if (spec.kind !== "ranked-bar" || spec.x.type !== "category" || spec.series.length === 0) return spec
  const [first] = spec.series
  const order = first.values.map((value, index) => ({ value, index })).sort((a, b) => b.value - a.value)
  const labels = spec.x.labels
  return {
    ...spec,
    x: { type: "category", labels: order.map(({ index }) => labels[index]) },
    series: spec.series.map((item) => ({ ...item, values: order.map(({ index }) => item.values[index]) })),
  }
}
