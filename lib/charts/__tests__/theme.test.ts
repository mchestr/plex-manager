/**
 * The Chart.js theme (P3.9, ui-design-system 3.5): every colour handed to
 * Chart.js parses with `@kurkle/color` (which has no `oklch()` parser), and
 * every colour is the `tokens.ts` hex.
 */

import { Color } from "@kurkle/color"
import { Chart } from "chart.js"

import { chartTheme, registerCharts, rewindChartTheme, type ChartTheme } from "@/lib/charts/theme"
import { rewindInks, themes, type InkName } from "@/lib/design/tokens"

function colours(theme: ChartTheme): string[] {
  return [...theme.series, ...theme.area, theme.other, theme.grid, theme.tick, ...Object.values(theme.tooltip)]
}

const INKS = Object.keys(rewindInks) as InkName[]

describe("chartTheme", () => {
  it.each(["dark", "light"] as const)("hands Chart.js only colours @kurkle/color parses (%s)", (mode) => {
    for (const colour of colours(chartTheme(mode))) {
      expect(new Color(colour).valid).toBe(true)
    }
  })

  it("would not parse the oklch() strings, which is why it reads hex", () => {
    expect(new Color(themes.dark["chart-1"].oklch).valid).toBe(false)
  })

  it.each(["dark", "light"] as const)("takes every colour from tokens.ts (%s)", (mode) => {
    const t = themes[mode]
    const theme = chartTheme(mode)
    expect(theme.series).toEqual([t["chart-1"].hex, t["chart-2"].hex, t["chart-3"].hex, t["chart-4"].hex, t["chart-5"].hex])
    expect(theme.other).toBe(t["muted-foreground"].hex)
    expect(theme.grid).toBe(t.border.hex)
    expect(theme.tick).toBe(t["muted-foreground"].hex)
    expect(theme.tooltip).toEqual({
      background: t.popover.hex,
      text: t["popover-foreground"].hex,
      border: t["border-strong"].hex,
    })
  })

  it("draws areas in each series colour at 16%", () => {
    const theme = chartTheme("dark")
    theme.area.forEach((area, i) => {
      expect(area.slice(0, 7)).toBe(theme.series[i])
      expect(new Color(area).rgb.a).toBeCloseTo(0.16, 2)
    })
  })
})

describe("rewindChartTheme", () => {
  it.each(INKS)("prints %s in its ink, with chart-2 as the spot and tooltips on paper", (ink) => {
    const { on, spot } = rewindInks[ink]
    const theme = rewindChartTheme(ink)
    const spotHex = spot === "on" || spot === "arch-deep" ? on.hex : rewindInks[spot].field.hex
    expect(theme.series).toEqual([on.hex, spotHex, on.hex, on.hex, on.hex])
    expect(theme.grid).toBe(on.hex)
    expect(theme.tooltip.background).toBe(rewindInks.paper.field.hex)
    for (const colour of colours(theme)) {
      expect(new Color(colour).valid).toBe(true)
    }
  })

  it("gives ultramarine its marigold spot", () => {
    expect(rewindChartTheme("ultramarine").series[1]).toBe(rewindInks.marigold.field.hex)
  })
})

describe("registerCharts", () => {
  it("registers Filler, so fill: true draws an area", () => {
    registerCharts()
    expect(Chart.registry.plugins.get("filler")).toBeDefined()
    expect(Chart.registry.controllers.get("line")).toBeDefined()
    expect(Chart.registry.elements.get("arc")).toBeDefined()
  })
})
