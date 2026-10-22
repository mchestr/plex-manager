import type { ChartSpec } from "@/components/ui/chart-card/chart-spec"
import { summarize } from "@/lib/charts/summary"
import { bindFormat } from "@/lib/utils/format"

const f = bindFormat({ locale: "en-US", timeZone: "UTC" })

const days = (values: number[], format: ChartSpec["format"] = "number"): ChartSpec => ({
  kind: "bar",
  x: { type: "day", keys: values.map((_, i) => `2026-10-${String(i + 1).padStart(2, "0")}`) },
  series: [{ id: "n", label: "Commands", values }],
  format,
})

describe("summarize", () => {
  it("says so when nothing happened", () => {
    expect(summarize(days([0, 0, 0]), f)).toBe("No activity in this period.")
    expect(summarize({ ...days([]), series: [] }, f)).toBe("No activity in this period.")
  })

  it("reads a single day as that day's value", () => {
    expect(summarize(days([4]), f)).toBe("4 on Oct 1, 2026.")
  })

  it("gives the total, the peak and a rise", () => {
    expect(summarize(days([1, 9, 3]), f)).toBe(
      "13 in total from Oct 1, 2026 to Oct 3, 2026. The peak was 9 on Oct 2, 2026, and the last day (3) was up from the first (1).",
    )
  })

  it("names a fall and a level end", () => {
    expect(summarize(days([5, 2]), f)).toContain("the last day (2) was down from the first (5)")
    expect(summarize(days([2, 7, 2]), f)).toContain("the last day (2) was level with the first (2)")
  })

  it("formats money", () => {
    expect(summarize(days([0.25, 12.5], "money"), f)).toBe(
      "$12.75 in total from Oct 1, 2026 to Oct 2, 2026. The peak was $12.50 on Oct 2, 2026, and the last day ($12.50) was up from the first ($0.250).",
    )
  })

  it("splits the total by series and peaks on the combined day", () => {
    const spec: ChartSpec = {
      kind: "stacked-bar",
      x: { type: "day", keys: ["2026-10-01", "2026-10-02"] },
      series: [
        { id: "success", label: "Successful", values: [3, 1] },
        { id: "failed", label: "Failed", values: [0, 4] },
      ],
      format: "number",
    }
    expect(summarize(spec, f)).toBe(
      "8 in total from Oct 1, 2026 to Oct 2, 2026 (Successful 4, Failed 4). The peak was 5 on Oct 2, 2026, and the last day (5) was up from the first (3).",
    )
  })

  it("names the leading category", () => {
    const spec: ChartSpec = {
      kind: "ranked-bar",
      x: { type: "category", labels: ["large", "small"] },
      series: [{ id: "cost", label: "Cost", values: [3, 1] }],
      format: "money",
    }
    expect(summarize(spec, f)).toBe("large leads with $3.00 of $4.00 across 2 categories.")
  })
})
