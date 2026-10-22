/**
 * The chart slot map (ui-design-system 3.5, UI-24).
 *
 * Charts draw in SVG, which reads the `oklch()` custom properties directly,
 * so every colour here is a `var(--token)` reference and follows the theme
 * class (and the Rewind scope's remap) with no reload and no hex hand-off.
 *
 * ## Rules
 *
 * - Series take `--chart-1` to `--chart-5` in fixed order and are never
 *   recoloured by rank; a sixth series or more folds into "Other"
 *   (`--muted-foreground`, see `foldSeries` in `chart-card/chart-spec.ts`).
 * - Gridlines use `--border`, ticks `--muted-foreground`, tooltips the
 *   popover tokens.
 * - Status colours are never series colours.
 *
 * @example
 * ```ts
 * seriesColours(["cost"])           // ["var(--chart-1)"]
 * seriesColours(["a", "b", "other"]) // ["var(--chart-1)", "var(--chart-2)", "var(--muted-foreground)"]
 * CHART_COLOURS.grid                 // "var(--border)"
 * ```
 *
 * @module lib/charts/theme
 */

/** `--chart-1` to `--chart-5`, in slot order. @internal */
export const CHART_SLOTS = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"] as const

/** The id `foldSeries` gives the series that sums the sixth and later. */
export const OTHER_SERIES_ID = "other"

export const CHART_COLOURS = {
  /** The "Other" series past the fifth. */
  other: "var(--muted-foreground)",
  grid: "var(--border)",
  tick: "var(--muted-foreground)",
} as const

/** Each series' colour, by its position: slot order, with "Other" muted. */
export function seriesColours(ids: readonly string[]): string[] {
  return ids.map((id, index) => (id === OTHER_SERIES_ID ? CHART_COLOURS.other : CHART_SLOTS[index % CHART_SLOTS.length]))
}
