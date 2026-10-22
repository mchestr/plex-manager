/**
 * The chart slot map (P10.9, ui-design-system 3.5): series take the chart
 * slots in fixed order, past five they fold into a muted "Other", and every
 * colour is a CSS variable, so charts follow the theme class.
 */

import { foldSeries, type ChartSeries } from "@/components/ui/chart-card/chart-spec"
import { CHART_COLOURS, CHART_SLOTS, OTHER_SERIES_ID, seriesColours } from "@/lib/charts/theme"

const series = (n: number): ChartSeries[] =>
  Array.from({ length: n }, (_, i) => ({ id: `s${i}`, label: `Series ${i}`, values: [i, i * 2] }))

describe("seriesColours", () => {
  it("gives the slots in order, never by rank", () => {
    expect(seriesColours(["small", "large", "mid"])).toEqual(["var(--chart-1)", "var(--chart-2)", "var(--chart-3)"])
  })

  it("folds a sixth series or more into a muted Other", () => {
    const folded = foldSeries(series(7))
    expect(folded).toHaveLength(5)
    expect(folded[4]).toEqual({ id: OTHER_SERIES_ID, label: "Other", values: [4 + 5 + 6, (4 + 5 + 6) * 2] })
    expect(seriesColours(folded.map((item) => item.id))).toEqual([...CHART_SLOTS.slice(0, 4), "var(--muted-foreground)"])
  })

  it("keeps five series as they are", () => {
    expect(seriesColours(foldSeries(series(5)).map((item) => item.id))).toEqual([...CHART_SLOTS])
  })

  it("reads only CSS variables, never hex", () => {
    for (const colour of [...CHART_SLOTS, ...Object.values(CHART_COLOURS)]) {
      expect(colour).toMatch(/^var\(--[a-z0-9-]+\)$/)
    }
    expect(CHART_COLOURS).toEqual({ other: "var(--muted-foreground)", grid: "var(--border)", tick: "var(--muted-foreground)" })
  })
})
