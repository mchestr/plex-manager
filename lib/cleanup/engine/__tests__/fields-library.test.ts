/** Library fields (TS 4.3, 4.5, 6.5, E16): `library.added` with two sources, and `file.size`. */

import { buildCondition, buildEvalContext, buildMovieItem, buildShowItem, daysAgo, NOW, NOW_S } from "@/lib/cleanup/__tests__/helpers/builders"
import { FIELD_EVALS, whySheetFact } from "@/lib/cleanup/engine/fields"
import { added, size } from "@/lib/cleanup/engine/fields/library"
import type { FieldVerdict } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { ConditionOf } from "@/lib/validations/cleanup-rule"
import { GiB, TiB } from "@/lib/validations/cleanup-vocabulary"

const ctx = buildEvalContext()
const radarrFailed = buildEvalContext({ sources: { ...ctx.sources, radarr: "failed" } })
const movie = (plex: number | null, arr: number | null) => buildMovieItem({ added: { plex, arr } })
const addedC = (op: "moreThan" | "lessThan", amount: number) => buildCondition("library.added", { op, value: { duration: { amount, unit: "days" } } })

describe("library.added (E16)", () => {
  type Role = "condition" | "protection"
  it.each<[string, SnapshotItem, ConditionOf<"library.added">, Role, FieldVerdict["verdict"]]>([
    ["condition: both dates old pass", movie(daysAgo(400), daysAgo(300)), addedC("moreThan", 90), "condition", "pass"],
    ["condition: a recent arr date fails", movie(daysAgo(400), daysAgo(10)), addedC("moreThan", 90), "condition", "fail"],
    ["condition: a recent Plex date fails (other order)", movie(daysAgo(10), daysAgo(400)), addedC("moreThan", 90), "condition", "fail"],
    ["condition: both recent pass less than", movie(daysAgo(5), daysAgo(10)), addedC("lessThan", 30), "condition", "pass"],
    ["condition: an old Plex date fails less than", movie(daysAgo(400), daysAgo(10)), addedC("lessThan", 30), "condition", "fail"],
    ["condition: an old arr date fails less than", movie(daysAgo(10), daysAgo(400)), addedC("lessThan", 30), "condition", "fail"],
    ["protection: one old date is enough", movie(daysAgo(400), daysAgo(10)), addedC("moreThan", 90), "protection", "pass"],
    ["protection: one old date is enough (other order)", movie(daysAgo(10), daysAgo(400)), addedC("moreThan", 90), "protection", "pass"],
    ["protection: no date passes", movie(daysAgo(10), daysAgo(20)), addedC("moreThan", 90), "protection", "fail"],
    ["protection: one recent date is enough", movie(daysAgo(400), daysAgo(10)), addedC("lessThan", 30), "protection", "pass"],
    ["protection: one recent date is enough (other order)", movie(daysAgo(10), daysAgo(400)), addedC("lessThan", 30), "protection", "pass"],
    ["one known date decides", movie(daysAgo(400), null), addedC("moreThan", 90), "condition", "pass"],
    ["one known arr date decides", movie(null, daysAgo(10)), addedC("moreThan", 90), "protection", "fail"],
  ])("%s", (_name, item, c, role, expected) => {
    expect(added.evaluate(item, c, ctx, role).verdict).toBe(expected)
  })

  it("compares instants at the boundary", () => {
    const item = movie(NOW_S - 90 * 86_400, NOW_S - 90 * 86_400)
    expect(added.evaluate(item, addedC("moreThan", 90), buildEvalContext({ now: NOW }), "condition").verdict).toBe("fail")
    expect(added.evaluate(item, addedC("moreThan", 90), buildEvalContext({ now: NOW + 1 }), "condition").verdict).toBe("pass")
  })

  it("is unknown with no known date", () => {
    expect(added.evaluate(movie(null, null), addedC("moreThan", 90), ctx, "condition")).toEqual({ verdict: "unknown", cause: { kind: "noValue", what: "date" } })
    expect(added.evaluate(movie(null, null), addedC("moreThan", 90), radarrFailed, "protection")).toEqual({
      verdict: "unknown", cause: { kind: "sourceFailed", service: "radarr" },
    })
  })

  it("lets the arr date that a failed read lost decide only when the known dates do not", () => {
    const unknown = { verdict: "unknown", cause: { kind: "sourceFailed", service: "radarr" } }
    const old = movie(daysAgo(400), null)
    const recent = movie(daysAgo(10), null)
    expect(added.evaluate(old, addedC("moreThan", 90), radarrFailed, "condition")).toEqual(unknown)
    expect(added.evaluate(recent, addedC("moreThan", 90), radarrFailed, "condition")).toEqual({ verdict: "fail" })
    expect(added.evaluate(old, addedC("moreThan", 90), radarrFailed, "protection")).toEqual({ verdict: "pass" })
    expect(added.evaluate(recent, addedC("moreThan", 90), radarrFailed, "protection")).toEqual(unknown)
    const notSetUp = buildEvalContext({ sources: { ...ctx.sources, radarr: "notConfigured" } })
    expect(added.evaluate(old, addedC("moreThan", 90), notSetUp, "condition")).toEqual({ verdict: "pass" })
    const show = buildShowItem({ added: { plex: daysAgo(400), arr: null } })
    const sonarrFailed = buildEvalContext({ sources: { ...ctx.sources, sonarr: "failed" } })
    expect(added.evaluate(show, addedC("moreThan", 90), sonarrFailed, "condition").cause).toEqual({ kind: "sourceFailed", service: "sonarr" })
    expect(added.evaluate(show, addedC("moreThan", 90), radarrFailed, "condition").verdict).toBe("pass")
  })

  it("reads the deciding date for near misses: the newest for more than, the oldest for less than", () => {
    const item = movie(daysAgo(70), daysAgo(80))
    expect(added.gap?.(item, addedC("moreThan", 90), ctx)).toBe(20)
    expect(added.gap?.(movie(daysAgo(40), daysAgo(50)), addedC("lessThan", 30), ctx)).toBe(20)
    expect(added.gap?.(movie(null, null), addedC("moreThan", 90), ctx)).toBeNull()
    expect(added.forecast?.(item, addedC("moreThan", 90), ctx)).toBe("2026-11-29") // Aug 30 plus 91 days
    expect(added.forecast?.(item, addedC("lessThan", 90), ctx)).toBeNull()
    expect(added.forecast?.(movie(null, null), addedC("moreThan", 90), ctx)).toBeNull()
    expect(added.tryValue?.(movie(daysAgo(70.5), daysAgo(80)), addedC("moreThan", 90), ctx)).toEqual({ duration: { amount: 70, unit: "days" } })
    expect(added.tryValue?.(movie(daysAgo(40), daysAgo(50)), addedC("lessThan", 30), ctx)).toEqual({ duration: { amount: 51, unit: "days" } })
    expect(added.tryValue?.(movie(null, null), addedC("lessThan", 30), ctx)).toBeNull()
    expect(added.tryValue?.(movie(daysAgo(0.2), null), addedC("moreThan", 30), ctx)).toBeNull()
    expect(added.measure?.(item, ctx)).toBe(70)
    expect(added.measure?.(movie(null, null), ctx)).toBeNull()
  })

  it("states the newer date, and each date with its source in the Why Sheet (TS 4.5)", () => {
    const plex = Date.parse("2023-02-10T12:00:00Z") / 1000
    const arr = Date.parse("2023-02-12T12:00:00Z") / 1000
    expect(added.fact(movie(plex, arr), ctx)).toEqual([{ text: "Added Feb 2023." }])
    expect(added.fact(movie(null, null), ctx)).toEqual([{ text: "Added date unknown." }])
    expect(whySheetFact("library.added", movie(plex, arr), ctx)).toEqual([{ text: "Added to Plex Feb 10, 2023." }, { text: "Added to Radarr Feb 12, 2023." }])
    expect(whySheetFact("library.added", buildShowItem({ added: { plex: null, arr } }), ctx)).toEqual([{ text: "Added to Sonarr Feb 12, 2023." }])
    expect(whySheetFact("library.added", movie(plex, null), ctx)).toEqual([{ text: "Added to Plex Feb 10, 2023." }])
    expect(whySheetFact("library.added", movie(null, null), ctx)).toEqual([{ text: "Added date unknown." }])
  })
})

describe("file.size", () => {
  const sized = (bytes: number | null) => buildMovieItem({ sizeBytes: bytes })
  const sizeC = (op: "moreThan" | "lessThan", bytes: number, unit: "GB" | "TB" = "GB") => buildCondition("file.size", { op, value: { bytes, unit } })

  it.each<[string, number | null, ConditionOf<"file.size">, FieldVerdict["verdict"]]>([
    ["more than: larger passes", 30 * GiB, sizeC("moreThan", 20 * GiB), "pass"],
    ["more than: equal fails", 20 * GiB, sizeC("moreThan", 20 * GiB), "fail"],
    ["more than: smaller fails", 10 * GiB, sizeC("moreThan", 20 * GiB), "fail"],
    ["less than: smaller passes", 10 * GiB, sizeC("lessThan", 20 * GiB), "pass"],
    ["less than: equal fails", 20 * GiB, sizeC("lessThan", 20 * GiB), "fail"],
    ["less than: larger fails", 2 * TiB, sizeC("lessThan", 1 * TiB, "TB"), "fail"],
    ["unknown size", null, sizeC("moreThan", 20 * GiB), "unknown"],
  ])("%s", (_name, bytes, c, expected) => {
    expect(size.evaluate(sized(bytes), c, ctx, "condition").verdict).toBe(expected)
    expect(FIELD_EVALS["file.size"].evaluate(sized(bytes), c, ctx, "protection").verdict).toBe(expected)
  })

  it("names the cause of an unknown size", () => {
    expect(size.evaluate(sized(null), sizeC("lessThan", GiB), ctx, "condition")).toEqual({ verdict: "unknown", cause: { kind: "noValue", what: "size" } })
  })

  it("gives the log gap, no forecast, and the size as the measure", () => {
    expect(size.gap?.(sized(40 * GiB), sizeC("moreThan", 20 * GiB), ctx)).toBe(100)
    expect(size.gap?.(sized(10 * GiB), sizeC("moreThan", 20 * GiB), ctx)).toBe(100)
    expect(size.gap?.(sized(25 * GiB), sizeC("moreThan", 20 * GiB), ctx)).toBe(32)
    expect(size.gap?.(sized(0), sizeC("moreThan", GiB), ctx)).toBe(3000)
    expect(size.gap?.(sized(null), sizeC("moreThan", GiB), ctx)).toBeNull()
    expect(size.forecast?.(sized(GiB), sizeC("moreThan", GiB), ctx)).toBeNull()
    expect(size.measure?.(sized(7 * GiB), ctx)).toBe(7 * GiB)
    expect(size.measure?.(sized(null), ctx)).toBeNull()
  })

  it.each<[string, number, ConditionOf<"file.size">, ConditionOf<"file.size">["value"] | null]>([
    ["more than: the whole GB below", 12.4 * GiB, sizeC("moreThan", 20 * GiB), { bytes: 12 * GiB, unit: "GB" }],
    ["more than: one less on the edge", 12 * GiB, sizeC("moreThan", 20 * GiB), { bytes: 11 * GiB, unit: "GB" }],
    ["more than: none below 1 GB", 0.5 * GiB, sizeC("moreThan", 20 * GiB), null],
    ["more than in TB", 2.5 * TiB, sizeC("moreThan", 3 * TiB, "TB"), { bytes: 2 * TiB, unit: "TB" }],
    ["more than in TB, under 1 TB in GB", 0.5 * TiB, sizeC("moreThan", 1 * TiB, "TB"), { bytes: 511 * GiB, unit: "GB" }],
    ["more than: at most 50 TB", 60 * TiB, sizeC("moreThan", 50 * TiB, "TB"), { bytes: 50 * TiB, unit: "TB" }],
    ["less than: the whole GB above", 12.4 * GiB, sizeC("lessThan", 5 * GiB), { bytes: 13 * GiB, unit: "GB" }],
    ["less than: one more on the edge", 12 * GiB, sizeC("lessThan", 5 * GiB), { bytes: 13 * GiB, unit: "GB" }],
    ["less than in TB", 2.5 * TiB, sizeC("lessThan", 1 * TiB, "TB"), { bytes: 3 * TiB, unit: "TB" }],
    ["less than: none above 50 TB", 50 * TiB, sizeC("lessThan", 1 * TiB, "TB"), null],
  ])("try value: %s", (_name, bytes, c, expected) => {
    expect(size.tryValue?.(sized(bytes), c, ctx)).toEqual(expected)
    if (expected) expect(size.evaluate(sized(bytes), { ...c, value: expected }, ctx, "condition").verdict).toBe("pass")
  })

  it("has no try value for an unknown size", () => {
    expect(size.tryValue?.(sized(null), sizeC("moreThan", GiB), ctx)).toBeNull()
  })

  it("states the size (TS 4.5)", () => {
    expect(size.fact(sized(12 * GiB), ctx)).toEqual([{ text: "12 GB." }])
    expect(size.fact(sized(1.5 * TiB), ctx)).toEqual([{ text: "1.5 TB." }])
    expect(size.fact(sized(null), ctx)).toEqual([{ text: "Size unknown." }])
  })
})
