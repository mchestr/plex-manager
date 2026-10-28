import {
  commandUsageSpec,
  dailyCommandsSpec,
  errorsByTypeSpec,
  errorTrendSpec,
  helpTopicsSpec,
  linkRequestsSpec,
  markingCommandsSpec,
  selectionSpec,
  topMarkedSpec,
  valuesByDay,
} from "@/components/admin/discord/specs"
import { dayWindow } from "@/lib/utils/day-window"

const keys = dayWindow({ from: "2026-10-15", to: "2026-10-17" }, "America/Los_Angeles").keys

describe("Discord ChartCard specs", () => {
  it("keys daily series on every day of the window, inclusive", () => {
    expect(keys).toEqual(["2026-10-15", "2026-10-16", "2026-10-17"])
  })

  it("stacks successful and failed commands on stable day keys", () => {
    const spec = dailyCommandsSpec(keys, [
      { date: "2026-10-15", total: 3, success: 2, failed: 1 },
      { date: "2026-10-16", total: 0, success: 0, failed: 0 },
      { date: "2026-10-17", total: 5, success: 5, failed: 0 },
    ])
    expect(spec).toEqual({
      kind: "stacked-bar",
      x: { type: "day", keys },
      series: [
        { id: "success", label: "Successful", values: [2, 0, 5] },
        { id: "failed", label: "Failed", values: [1, 0, 0] },
      ],
      format: "number",
    })
  })

  it("zero-fills link requests, which only return days with rows", () => {
    const spec = linkRequestsSpec(keys, {
      totalLinkRequests: 2,
      uniqueUnlinkedUsers: 1,
      linkRequestsByDay: [{ date: "2026-10-16", count: 2 }],
      repeatRequestUsers: [],
    })
    expect(spec.x).toEqual({ type: "day", keys })
    expect(spec.series[0].values).toEqual([0, 2, 0])
  })

  it("draws errors per day from the zero-filled trend and drops days outside the window", () => {
    const spec = errorTrendSpec(keys, {
      totalErrors: 1,
      errorsByType: [],
      errorsByCommand: [],
      errorTrend: [
        { date: "2026-10-14", count: 9 },
        { date: "2026-10-17", count: 1 },
      ],
    })
    expect(spec.kind).toBe("bar")
    expect(spec.series[0].values).toEqual([0, 0, 1])
  })

  it("gives an empty window an all-zero series, never a missing one", () => {
    expect(dailyCommandsSpec(keys, []).series.map((s) => s.values)).toEqual([
      [0, 0, 0],
      [0, 0, 0],
    ])
    expect(linkRequestsSpec(keys, null).series[0].values).toEqual([0, 0, 0])
    expect(valuesByDay([], [{ date: "2026-10-15", n: 1 }], (row) => row.n)).toEqual([])
  })

  it("ranks command usage largest first and folds the tail into Other", () => {
    const stats = Array.from({ length: 10 }, (_, i) => ({
      commandName: `!cmd${i}`,
      commandType: "CHAT" as const,
      totalCount: i + 1,
      successCount: i + 1,
      failedCount: 0,
      avgResponseTimeMs: null,
    }))
    const spec = commandUsageSpec(stats)
    expect(spec.kind).toBe("ranked-bar")
    expect(spec.x).toEqual({
      type: "category",
      labels: ["!cmd9", "!cmd8", "!cmd7", "!cmd6", "!cmd5", "!cmd4", "!cmd3", "Other"],
    })
    expect(spec.series[0].values).toEqual([10, 9, 8, 7, 6, 5, 4, 6])
  })

  it("labels errors by type and marks by command in words", () => {
    const errors = errorsByTypeSpec({
      totalErrors: 3,
      errorsByType: [
        { commandType: "MEDIA_MARK", count: 1 },
        { commandType: "CHAT", count: 2 },
      ],
      errorsByCommand: [],
      errorTrend: [],
    })
    expect(errors.x).toEqual({ type: "category", labels: ["Chat", "Media mark"] })

    const marking = { byCommand: [{ commandName: "!notinterested", count: 4, successCount: 4, failedCount: 0 }], topMediaMarked: [{ title: "Dune", count: 2 }] }
    expect(markingCommandsSpec(marking).x).toEqual({ type: "category", labels: ["Not interested"] })
    expect(topMarkedSpec(marking).series[0]).toEqual({ id: "value", label: "Times marked", values: [2] })
  })

  it("keeps selection options in option order with the unrecognised ones last", () => {
    const spec = selectionSpec({
      totalSelections: 6,
      selectionsByNumber: [
        { selection: "unknown", count: 1 },
        { selection: "3", count: 2 },
        { selection: "1", count: 3 },
      ],
      successRate: 100,
      avgResponseTimeMs: null,
    })
    expect(spec.kind).toBe("bar")
    expect(spec.x).toEqual({ type: "category", labels: ["Option 1", "Option 3", "Other"] })
    expect(spec.series[0].values).toEqual([3, 2, 1])
  })

  it("builds empty category specs when a metric failed to load", () => {
    expect(helpTopicsSpec(null).x).toEqual({ type: "category", labels: [] })
    expect(selectionSpec(null).series[0].values).toEqual([])
  })
})
