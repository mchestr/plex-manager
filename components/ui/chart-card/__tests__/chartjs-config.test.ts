import { chartTheme } from "@/lib/charts/theme"
import { bindFormat } from "@/lib/utils/format"

import { chartjsConfig } from "../chartjs-config"
import { foldSeries, type ChartSpec } from "../chart-spec"

const f = bindFormat({ timeZone: "UTC", locale: "en-US" })
const theme = chartTheme("dark")
const days = { type: "day" as const, keys: ["2026-10-15", "2026-10-16", "2026-10-17"] }

const specs: Record<string, ChartSpec> = {
  "daily cost": { kind: "bar", x: days, series: [{ id: "cost", label: "Cost", values: [0, 0.02, 0.07] }], format: "money" },
  "links and visits": {
    kind: "bar",
    x: days,
    series: [
      { id: "links", label: "Links created", values: [1, 0, 2] },
      { id: "visits", label: "Visits", values: [3, 0, 9] },
    ],
    format: "number",
  },
  "commands stacked": {
    kind: "stacked-bar",
    x: days,
    series: [
      { id: "success", label: "Succeeded", values: [4, 1, 0] },
      { id: "failed", label: "Failed", values: [1, 0, 0] },
    ],
    format: "number",
  },
  "cost by model": {
    kind: "ranked-bar",
    x: { type: "category", labels: ["gpt-5-mini", "gpt-5"] },
    series: [{ id: "cost", label: "Cost", values: [0.01, 0.05] }],
    format: "money",
  },
  "trend line": { kind: "line", x: days, series: [{ id: "tokens", label: "Tokens", values: [10, 20, 5] }], format: "tokens" },
}

describe("chartjsConfig", () => {
  it.each(Object.entries(specs))("%s: takes every colour from chartTheme", (_name, spec) => {
    const config = chartjsConfig(spec, theme, f)
    config.data.datasets.forEach((dataset, index) => {
      expect(dataset.borderColor).toBe(theme.series[index])
    })
    const scales = config.options.scales as Record<string, { grid: { color?: string; display?: boolean }; ticks: { color: string } }>
    for (const scale of Object.values(scales)) {
      expect(scale.ticks.color).toBe(theme.tick)
      if (scale.grid.color) expect(scale.grid.color).toBe(theme.grid)
    }
    expect(config.options.plugins?.tooltip?.backgroundColor).toBe(theme.tooltip.background)
    expect(JSON.stringify(config.options)).not.toMatch(/#94a3b8|#1e293b/)
    expect(config.options).toMatchSnapshot()
  })

  it("draws daily bars with no curve, and lines with tension 0", () => {
    expect(chartjsConfig(specs["daily cost"], theme, f).type).toBe("bar")
    const line = chartjsConfig(specs["trend line"], theme, f)
    expect(line.data.datasets[0]).toMatchObject({ tension: 0 })
  })

  it("labels day keys from their parts and ranks categories horizontally, largest first", () => {
    expect(chartjsConfig(specs["daily cost"], theme, f).data.labels).toEqual(["Oct 15", "Oct 16", "Oct 17"])
    const ranked = chartjsConfig(specs["cost by model"], theme, f)
    expect(ranked.options.indexAxis).toBe("y")
    expect(ranked.data.labels).toEqual(["gpt-5", "gpt-5-mini"])
    expect(ranked.data.datasets[0].data).toEqual([0.05, 0.01])
  })

  it("stacks stacked bars and formats money ticks", () => {
    const stacked = chartjsConfig(specs["commands stacked"], theme, f)
    expect(stacked.options.scales?.x?.stacked).toBe(true)
    const money = chartjsConfig(specs["daily cost"], theme, f).options.scales?.y?.ticks as { callback: (v: number) => string }
    expect(money.callback(0.07)).toBe("$0.070")
  })
})

describe("foldSeries", () => {
  it("keeps five series and folds the rest into Other", () => {
    const series = Array.from({ length: 7 }, (_, index) => ({ id: `s${index}`, label: `S${index}`, values: [index] }))
    const folded = foldSeries(series)
    expect(folded.map((item) => item.label)).toEqual(["S0", "S1", "S2", "S3", "Other"])
    expect(folded[4].values).toEqual([4 + 5 + 6])
    const config = chartjsConfig({ kind: "bar", x: { type: "category", labels: ["a"] }, series, format: "number" }, theme, f)
    expect(config.data.datasets[4].borderColor).toBe(theme.other)
  })
})
