/** Show and season fields (TS 4.3, 4.5, 6.5): status, last episode added, seasons on disk and season position. */

import { buildCondition, buildEvalContext, buildSeasonItem, buildShowItem, daysAgo, NOW, NOW_S } from "@/lib/cleanup/__tests__/helpers/builders"
import { FIELD_EVALS } from "@/lib/cleanup/engine/fields"
import { lastEpisodeAdded, ordinal, position, seasonsOnDisk, status } from "@/lib/cleanup/engine/fields/shows"
import type { EvalContext, FieldVerdict } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { ConditionOf } from "@/lib/validations/cleanup-rule"

const ctx = buildEvalContext()
const sonarr = (state: "failed" | "notConfigured"): EvalContext => buildEvalContext({ sources: { ...ctx.sources, sonarr: state } })
const SONARR_FAILED: FieldVerdict = { verdict: "unknown", cause: { kind: "sourceFailed", service: "sonarr" } }
type ShowFacts = NonNullable<SnapshotItem["show"]>
const facts = (overrides: Partial<ShowFacts> = {}): ShowFacts => ({
  status: "ended", seasonsOnDisk: 3, newestSeasonOnDisk: 3, lastEpisodeAddedAt: daysAgo(500), ...overrides,
})
const show = (overrides: Partial<ShowFacts> | null) => buildShowItem({ show: overrides === null ? null : facts(overrides) })

describe("show.status", () => {
  const is = (value: "ended" | "continuing") => buildCondition("show.status", { value: { status: value } })
  it.each<[ShowFacts["status"], FieldVerdict["verdict"], FieldVerdict["verdict"]]>([
    ["ended", "pass", "fail"],
    ["continuing", "fail", "pass"],
    ["upcoming", "fail", "fail"],
    ["deleted", "fail", "fail"],
  ])("status %s: ended %s, continuing %s", (value, ended, continuing) => {
    expect(status.evaluate(show({ status: value }), is("ended"), ctx, "condition").verdict).toBe(ended)
    expect(status.evaluate(show({ status: value }), is("continuing"), ctx, "protection").verdict).toBe(continuing)
  })

  it("reads a season's show status", () => {
    expect(status.evaluate(buildSeasonItem(show({ status: "continuing" }), 2), is("continuing"), ctx, "condition").verdict).toBe("pass")
  })

  it("is unknown with no Sonarr record, and names a failed or missing Sonarr", () => {
    expect(status.evaluate(show({ status: null }), is("ended"), ctx, "condition")).toEqual({ verdict: "unknown" })
    expect(status.evaluate(show(null), is("ended"), ctx, "condition")).toEqual({ verdict: "unknown" })
    expect(status.evaluate(show(null), is("ended"), sonarr("failed"), "condition")).toEqual(SONARR_FAILED)
    expect(status.evaluate(show({ status: "ended" }), is("ended"), sonarr("notConfigured"), "condition")).toEqual(SONARR_FAILED)
  })

  it("has no order, and states the status (TS 4.5)", () => {
    expect(status.gap?.(show({}), is("ended"), ctx)).toBeNull()
    expect(status.forecast?.(show({}), is("ended"), ctx)).toBeNull()
    expect(status.tryValue?.(show({}), is("ended"), ctx)).toBeNull()
    expect(status.measure?.(show({}), ctx)).toBeNull()
    expect(status.fact(show({ status: "ended" }), ctx)).toEqual([{ text: "Ended." }])
    expect(status.fact(show({ status: "continuing" }), ctx)).toEqual([{ text: "Continuing." }])
    expect(status.fact(show({ status: "upcoming" }), ctx)).toEqual([{ text: "Upcoming." }])
    expect(status.fact(show({ status: "deleted" }), ctx)).toEqual([{ text: "Deleted." }])
    expect(status.fact(show(null), ctx)).toEqual([{ text: "Status unknown." }])
  })
})

describe("show.lastEpisodeAdded", () => {
  const lastC = (op: "moreThan" | "lessThan", amount: number) => buildCondition("show.lastEpisodeAdded", { op, value: { duration: { amount, unit: "days" } } })
  it.each<[string, SnapshotItem, ConditionOf<"show.lastEpisodeAdded">, FieldVerdict["verdict"]]>([
    ["more than: an old episode passes", show({ lastEpisodeAddedAt: daysAgo(500) }), lastC("moreThan", 365), "pass"],
    ["more than: a recent episode fails", show({ lastEpisodeAddedAt: daysAgo(100) }), lastC("moreThan", 365), "fail"],
    ["less than: a recent episode passes", show({ lastEpisodeAddedAt: daysAgo(10) }), lastC("lessThan", 30), "pass"],
    ["less than: an old episode fails", show({ lastEpisodeAddedAt: daysAgo(40) }), lastC("lessThan", 30), "fail"],
    ["a season reads its own newest episode", buildSeasonItem(show({}), 1, { show: facts({ lastEpisodeAddedAt: daysAgo(5) }) }),
      lastC("lessThan", 30), "pass"],
  ])("%s", (_name, item, c, expected) => {
    expect(lastEpisodeAdded.evaluate(item, c, ctx, "condition").verdict).toBe(expected)
  })

  it("compares instants at the boundary", () => {
    const item = show({ lastEpisodeAddedAt: NOW_S - 365 * 86_400 })
    expect(lastEpisodeAdded.evaluate(item, lastC("moreThan", 365), buildEvalContext({ now: NOW }), "condition").verdict).toBe("fail")
    expect(lastEpisodeAdded.evaluate(item, lastC("moreThan", 365), buildEvalContext({ now: NOW + 1 }), "condition").verdict).toBe("pass")
  })

  it("is unknown with no date, and names Sonarr when the show facts were lost", () => {
    const noDate = { verdict: "unknown", cause: { kind: "noValue", what: "date" } }
    expect(lastEpisodeAdded.evaluate(show({ lastEpisodeAddedAt: null }), lastC("moreThan", 365), ctx, "condition")).toEqual(noDate)
    expect(lastEpisodeAdded.evaluate(show(null), lastC("moreThan", 365), ctx, "condition")).toEqual(noDate)
    expect(lastEpisodeAdded.evaluate(show(null), lastC("moreThan", 365), sonarr("failed"), "condition")).toEqual(SONARR_FAILED)
  })

  it("gives the near-miss values of a date field", () => {
    const item = show({ lastEpisodeAddedAt: daysAgo(300) })
    expect(lastEpisodeAdded.gap?.(item, lastC("moreThan", 365), ctx)).toBe(65)
    expect(lastEpisodeAdded.gap?.(show({ lastEpisodeAddedAt: null }), lastC("moreThan", 365), ctx)).toBeNull()
    expect(lastEpisodeAdded.forecast?.(item, lastC("moreThan", 365), ctx)).toBe("2027-01-13") // Jan 12, 2026 plus 366 days
    expect(lastEpisodeAdded.forecast?.(item, lastC("lessThan", 365), ctx)).toBeNull()
    expect(lastEpisodeAdded.forecast?.(show(null), lastC("moreThan", 365), ctx)).toBeNull()
    expect(lastEpisodeAdded.tryValue?.(item, lastC("moreThan", 365), ctx)).toEqual({ duration: { amount: 299, unit: "days" } })
    expect(lastEpisodeAdded.tryValue?.(item, lastC("lessThan", 30), ctx)).toEqual({ duration: { amount: 301, unit: "days" } })
    expect(lastEpisodeAdded.tryValue?.(show(null), lastC("lessThan", 30), ctx)).toBeNull()
    expect(lastEpisodeAdded.tryValue?.(show({ lastEpisodeAddedAt: daysAgo(0.5) }), lastC("moreThan", 30), ctx)).toBeNull()
    expect(lastEpisodeAdded.measure?.(item, ctx)).toBe(300)
    expect(lastEpisodeAdded.measure?.(show(null), ctx)).toBeNull()
  })

  it("states the newest episode (TS 4.5)", () => {
    expect(lastEpisodeAdded.fact(show({ lastEpisodeAddedAt: Date.parse("2025-09-20T12:00:00Z") / 1000 }), ctx)).toEqual([
      { text: "Last episode added Sep 2025." },
    ])
    expect(lastEpisodeAdded.fact(show({ lastEpisodeAddedAt: null }), ctx)).toEqual([{ text: "No episode in Plex." }])
    expect(lastEpisodeAdded.fact(show(null), ctx)).toEqual([])
  })
})

describe("show.seasonsOnDisk", () => {
  const onDisk = (op: "atLeast" | "fewerThan", count: number) => buildCondition("show.seasonsOnDisk", { op, value: { count } })
  it.each<[number, ConditionOf<"show.seasonsOnDisk">, FieldVerdict["verdict"]]>([
    [3, onDisk("atLeast", 3), "pass"],
    [2, onDisk("atLeast", 3), "fail"],
    [2, onDisk("fewerThan", 3), "pass"],
    [3, onDisk("fewerThan", 3), "fail"],
  ])("%i seasons: %j is %s", (n, c, expected) => {
    expect(seasonsOnDisk.evaluate(show({ seasonsOnDisk: n }), c, ctx, "condition").verdict).toBe(expected)
    expect(seasonsOnDisk.evaluate(buildSeasonItem(show({ seasonsOnDisk: n }), 1), c, ctx, "condition").verdict).toBe(expected)
  })

  it("is unknown with no Sonarr value", () => {
    expect(seasonsOnDisk.evaluate(show({ seasonsOnDisk: null }), onDisk("atLeast", 3), ctx, "condition")).toEqual({ verdict: "unknown" })
    expect(seasonsOnDisk.evaluate(show(null), onDisk("atLeast", 3), sonarr("failed"), "condition")).toEqual(SONARR_FAILED)
  })

  it("gives the count difference and the item's count as the try value", () => {
    expect(seasonsOnDisk.gap?.(show({ seasonsOnDisk: 1 }), onDisk("atLeast", 4), ctx)).toBe(3)
    expect(seasonsOnDisk.gap?.(show(null), onDisk("atLeast", 4), ctx)).toBeNull()
    expect(seasonsOnDisk.tryValue?.(show({ seasonsOnDisk: 2 }), onDisk("atLeast", 4), ctx)).toEqual({ count: 2 })
    expect(seasonsOnDisk.tryValue?.(show({ seasonsOnDisk: 0 }), onDisk("atLeast", 4), ctx)).toEqual({ count: 1 })
    expect(seasonsOnDisk.tryValue?.(show({ seasonsOnDisk: 5 }), onDisk("fewerThan", 4), ctx)).toBeNull()
    expect(seasonsOnDisk.tryValue?.(show(null), onDisk("atLeast", 4), ctx)).toBeNull()
    expect(seasonsOnDisk.forecast?.(show({}), onDisk("atLeast", 4), ctx)).toBeNull()
    expect(seasonsOnDisk.measure?.(show({}), ctx)).toBeNull()
  })

  it("states the seasons on disk (TS 4.5)", () => {
    expect(seasonsOnDisk.fact(show({ seasonsOnDisk: 3 }), ctx)).toEqual([{ text: "3 seasons on disk." }])
    expect(seasonsOnDisk.fact(show({ seasonsOnDisk: 1 }), ctx)).toEqual([{ text: "1 season on disk." }])
    expect(seasonsOnDisk.fact(show(null), ctx)).toEqual([])
  })
})

describe("season.position", () => {
  const pos = (op: "notNewest" | "newest", count: number) => buildCondition("season.position", { op, value: { count } })
  const season = (p: number | null, overrides: Partial<SnapshotItem> = {}) => buildSeasonItem(show({}), 1, { position: p, ...overrides })

  it.each<[number | null, ConditionOf<"season.position">, FieldVerdict["verdict"]]>([
    [3, pos("notNewest", 2), "pass"],
    [2, pos("notNewest", 2), "fail"],
    [2, pos("newest", 2), "pass"],
    [3, pos("newest", 2), "fail"],
    [null, pos("notNewest", 2), "fail"],
    [null, pos("newest", 2), "fail"],
  ])("position %s: %j is %s", (p, c, expected) => {
    expect(position.evaluate(season(p), c, ctx, "condition").verdict).toBe(expected)
  })

  it("fails a season with no number, and is unknown while Sonarr failed", () => {
    expect(position.evaluate(season(3, { seasonNumber: null }), pos("notNewest", 2), ctx, "condition").verdict).toBe("fail")
    expect(position.evaluate(season(3), pos("notNewest", 2), sonarr("failed"), "condition")).toEqual(SONARR_FAILED)
    expect(FIELD_EVALS["season.position"].evaluate(season(3), pos("newest", 2), sonarr("notConfigured"), "protection")).toEqual(SONARR_FAILED)
  })

  it("gives the position difference and position minus 1 as the try value", () => {
    expect(position.gap?.(season(1), pos("notNewest", 3), ctx)).toBe(2)
    expect(position.gap?.(season(null), pos("notNewest", 3), ctx)).toBeNull()
    expect(position.tryValue?.(season(2), pos("notNewest", 3), ctx)).toEqual({ count: 1 })
    expect(position.tryValue?.(season(1), pos("notNewest", 3), ctx)).toBeNull()
    expect(position.tryValue?.(season(5), pos("newest", 3), ctx)).toBeNull()
    expect(position.tryValue?.(season(null), pos("notNewest", 3), ctx)).toBeNull()
    expect(position.forecast?.(season(2), pos("notNewest", 3), ctx)).toBeNull()
    expect(position.measure?.(season(2), ctx)).toBeNull()
  })

  it("states the position (TS 4.5)", () => {
    expect(position.fact(season(1), ctx)).toEqual([{ text: "The newest season." }])
    expect(position.fact(season(2), ctx)).toEqual([{ text: "2nd newest season." }])
    expect(position.fact(season(3), ctx)).toEqual([{ text: "3rd newest season." }])
    expect(position.fact(season(null), ctx)).toEqual([{ text: "No season number." }])
    expect(position.fact(season(2, { seasonNumber: null }), ctx)).toEqual([{ text: "No season number." }])
  })

  it.each<[number, string]>([
    [1, "1st"], [2, "2nd"], [3, "3rd"], [4, "4th"], [11, "11th"], [12, "12th"], [13, "13th"], [21, "21st"], [22, "22nd"], [23, "23rd"], [101, "101st"], [111, "111th"],
  ])("ordinal %i is %s", (n, words) => {
    expect(ordinal(n)).toBe(words)
  })
})
