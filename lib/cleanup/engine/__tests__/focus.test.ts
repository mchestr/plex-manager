/** The open condition editor (TS 6.6): presets with counts, buckets with `passes`, the summary, the computed date and the library hint. */

import { buildCondition, buildMovieItem, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { compileDraft } from "@/lib/cleanup/engine/compile"
import { bucketPasses, computedDate, previewFocus } from "@/lib/cleanup/engine/focus"
import type { HistogramBucket } from "@/lib/cleanup/engine/types"
import { buildDraft, realContext } from "@/lib/cleanup/preview/__tests__/helpers/preview-data"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { Condition } from "@/lib/validations/cleanup-rule"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

const played = (key: number, days: number | null, size = 10): SnapshotItem =>
  buildMovieItem({
    key: `movie:tmdb:${key}`,
    sizeBytes: size * GiB,
    plays: { lastCountedAt: days === null ? null : daysAgo(days), countedAt: days === null ? [] : [daysAgo(days)], viewers: [] },
  })

const ITEMS = [played(1, 10), played(2, 100), played(3, 400), played(4, 900), played(5, null), played(6, 29.9), played(7, 30.1)]

function focusOf(condition: Condition, items: readonly SnapshotItem[] = ITEMS, zone = "UTC") {
  const compiled = compileDraft(buildDraft({ conditions: [condition] }))
  return previewFocus({ compiled, items, ctx: realContext({ zone }), conditionId: condition.id })
}

describe("previewFocus buckets", () => {
  it("counts each item in its bucket of days, and the never played ones in Never", () => {
    const focus = focusOf(buildCondition("watch.lastPlayed"))
    expect(focus?.buckets.map((b) => [b.label, b.count])).toEqual([
      ["Last 30 days", 2], ["1 to 3 months", 1], ["3 to 6 months", 1], ["6 to 12 months", 0], ["1 to 2 years", 1], ["2 years or more", 1], ["Never", 1],
    ])
  })

  it.each<[string, Condition, boolean[]]>([
    ["more than 365 days, or never", buildCondition("watch.lastPlayed"), [false, false, false, false, true, true, true]],
    ["more than 182 days, no never", buildCondition("watch.lastPlayed", { value: { duration: { amount: 182, unit: "days" }, orNever: false } }),
      [false, false, false, true, true, true, false]],
    ["a threshold inside a bucket splits it", buildCondition("watch.lastPlayed", { value: { duration: { amount: 200, unit: "days" }, orNever: true } }),
      [false, false, false, false, true, true, true]],
    ["less than 91 days", buildCondition("watch.lastPlayed", { op: "lessThan", value: { duration: { amount: 91, unit: "days" }, orNever: false } }),
      [true, true, false, false, false, false, false]],
    ["never", buildCondition("watch.lastPlayed", { op: "never" }), [false, false, false, false, false, false, true]],
  ])("passes the buckets that every value passes: %s", (_name, condition, passes) => {
    expect(focusOf(condition)?.buckets.map((b) => b.passes)).toEqual(passes)
  })

  it("buckets sizes by the level's edges, and a bucket on the threshold edge passes", () => {
    const sized = [played(1, 10, 1), played(2, 10, 3), played(3, 10, 25), played(4, 10, 60)]
    const focus = focusOf(buildCondition("file.size", { value: { bytes: 20 * GiB, unit: "GB" } }), sized)
    expect(focus?.buckets).toEqual([
      { label: "Under 2 GB", count: 1, passes: false },
      { label: "2 to 5 GB", count: 1, passes: false },
      { label: "5 to 10 GB", count: 0, passes: false },
      { label: "10 to 20 GB", count: 0, passes: false },
      { label: "20 to 40 GB", count: 1, passes: true },
      { label: "40 GB or more", count: 1, passes: true },
    ])
    const smaller = focusOf(buildCondition("file.size", { op: "lessThan", value: { bytes: 10 * GiB, unit: "GB" } }), sized)
    expect(smaller?.buckets.map((b) => b.passes)).toEqual([true, true, true, false, false, false])
  })

  it("leaves unknown items out of every bucket and names them in the summary", () => {
    const unknown = buildMovieItem({ key: "movie:tmdb:99", plays: null })
    const focus = focusOf(buildCondition("watch.lastPlayed"), [...ITEMS, unknown])
    expect(focus?.buckets.reduce((n, b) => n + b.count, 0)).toBe(7)
    expect(focus?.summary).toBe("3 of 8 movies pass this condition. 1 is unknown.")
    const two = focusOf(buildCondition("watch.lastPlayed"), [...ITEMS, unknown, { ...unknown, key: "movie:tmdb:98" }])
    expect(two?.summary).toBe("3 of 9 movies pass this condition. 2 are unknown.")
  })

  it("gives fields with no histogram no buckets, and the summary still counts", () => {
    const focus = focusOf(buildCondition("watch.plays"))
    expect(focus?.buckets).toEqual([])
    expect(focus?.summary).toBe("1 of 7 movies pass this condition.")
  })

  it("names a bucket of the Never kind passing only for the last played field", () => {
    const never: HistogramBucket = { label: "Never", from: null, to: null, never: true }
    expect(bucketPasses(buildCondition("file.size"), never)).toBe(false)
    expect(bucketPasses(buildCondition("show.status"), { label: "x", from: 0, to: 1 })).toBe(false)
  })
})

describe("previewFocus presets", () => {
  it("counts the matches with only the value replaced, keeping the operator and or never", () => {
    const focus = focusOf(buildCondition("watch.lastPlayed"))
    expect(focus?.presets).toEqual([
      { value: { amount: 90, unit: "days" }, label: "90 days", matches: 4 },
      { value: { amount: 180, unit: "days" }, label: "180 days", matches: 3 },
      { value: { amount: 365, unit: "days" }, label: "365 days", matches: 3 },
      { value: { amount: 2, unit: "years" }, label: "2 years", matches: 2 },
    ])
  })

  it("counts the protection presets as matches of the rule with that protection", () => {
    const draft = buildDraft({ conditions: [buildCondition("file.size", { value: { bytes: GiB, unit: "GB" } })],
      protections: [buildCondition("watch.plays", { id: "p1", op: "atLeast", value: { count: 1, window: { kind: "total" } } })] })
    const focus = previewFocus({ compiled: compileDraft(draft), items: ITEMS, ctx: realContext(), conditionId: "p1" })
    expect(focus?.summary).toBe("6 of 7 movies pass this condition.")
    // G4 keeps the two titles played in the last 30 days safe whatever the protection's value
    expect(focus?.presets.map((p) => [p.label, p.matches])).toEqual([["1", 1], ["2", 5], ["3", 5]])
  })

  it("gives null for an id that names no complete condition", () => {
    expect(previewFocus({ compiled: compileDraft(buildDraft()), items: ITEMS, ctx: realContext(), conditionId: "c9" })).toBeNull()
  })
})

describe("the computed date and the library hint", () => {
  it("writes the date in the server zone, before or after by the operator", () => {
    const late = { now: Date.parse("2026-11-09T05:00:00.000Z"), zone: "America/Los_Angeles" }
    expect(computedDate(buildCondition("watch.lastPlayed"), late)).toBe("Played before Nov 8, 2025, server time (America/Los_Angeles).")
    expect(computedDate(buildCondition("watch.lastPlayed"), { ...late, zone: "UTC" })).toBe("Played before Nov 9, 2025, server time (UTC).")
    expect(computedDate(buildCondition("library.added", { op: "lessThan" }), { now: NOW, zone: "Europe/Berlin" })).toBe(
      "Added after Aug 10, 2026, server time (Europe/Berlin).")
    expect(computedDate(buildCondition("request.age"), { now: NOW, zone: "UTC" })).toBe("Requested before Jul 11, 2026, server time (UTC).")
    expect(computedDate(buildCondition("show.lastEpisodeAdded"), { now: NOW, zone: "UTC" })).toBe("Newest episode before Nov 8, 2025, server time (UTC).")
  })

  it("has no computed date for never and for fields without a duration", () => {
    expect(computedDate(buildCondition("watch.lastPlayed", { op: "never" }), { now: NOW, zone: "UTC" })).toBeUndefined()
    expect(computedDate(buildCondition("file.size"), { now: NOW, zone: "UTC" })).toBeUndefined()
    expect(focusOf(buildCondition("watch.plays"))?.computedDate).toBeUndefined()
  })

  it("puts the computed date on the focus in a zone other than UTC", () => {
    expect(focusOf(buildCondition("watch.lastPlayed"), ITEMS, "Pacific/Auckland")?.computedDate).toBe(
      "Played before Nov 9, 2025, server time (Pacific/Auckland).")
  })

  it("gives Size the median and the largest known size", () => {
    const sized = [played(1, 10, 1), played(2, 10, 3), played(3, 10, 25), { ...played(4, 10), sizeBytes: null }]
    expect(focusOf(buildCondition("file.size"), sized)?.libraryHint).toBe("Your movies: median 3 GB, largest 25 GB.")
    expect(focusOf(buildCondition("file.size"), [{ ...played(4, 10), sizeBytes: null }])?.libraryHint).toBeUndefined()
    expect(focusOf(buildCondition("watch.lastPlayed"))?.libraryHint).toBeUndefined()
  })
})
