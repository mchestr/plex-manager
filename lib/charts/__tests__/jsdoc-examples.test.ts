/**
 * The @example block in lib/charts/theme.ts.
 */

import { chartTheme, registerCharts, rewindChartTheme } from "@/lib/charts/theme"

describe("JSDoc Documentation Examples", () => {
  it("chartTheme", () => {
    registerCharts()
    const theme = chartTheme("dark")
    expect(theme.series[0]).toBe("#cb8315")
    expect(theme.area[0]).toBe("#cb831529")
    expect(rewindChartTheme("marigold").series[0]).toBe("#1f1306")
  })
})
