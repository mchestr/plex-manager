/**
 * The @example blocks in lib/charts/theme.ts and lib/charts/summary.ts.
 */

import { summarize } from "@/lib/charts/summary"
import { CHART_COLOURS, seriesColours } from "@/lib/charts/theme"
import { bindFormat } from "@/lib/utils/format"

describe("JSDoc Documentation Examples", () => {
  it("seriesColours", () => {
    expect(seriesColours(["cost"])).toEqual(["var(--chart-1)"])
    expect(seriesColours(["a", "b", "other"])).toEqual(["var(--chart-1)", "var(--chart-2)", "var(--muted-foreground)"])
    expect(CHART_COLOURS.grid).toBe("var(--border)")
  })

  it("summarize", () => {
    const f = bindFormat({ locale: "en-US", timeZone: "UTC" })
    expect(
      summarize(
        {
          kind: "bar",
          x: { type: "day", keys: ["2026-10-16", "2026-10-17"] },
          series: [{ id: "cost", label: "Cost", values: [0.5, 1.25] }],
          format: "money",
        },
        f,
      ),
    ).toBe(
      "$1.75 in total from Oct 16, 2026 to Oct 17, 2026. The peak was $1.25 on Oct 17, 2026, and the last day ($1.25) was up from the first ($0.500).",
    )
  })
})
