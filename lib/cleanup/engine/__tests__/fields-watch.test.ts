/** Watching fields (TS 4.3, 4.5, 6.5): `watch.lastPlayed` and `watch.plays`, with X2 and the instant boundaries. */

import { buildCondition, buildEvalContext, buildMovieItem, daysAgo, NOW, NOW_S } from "@/lib/cleanup/__tests__/helpers/builders"
import { conditionFact, FIELD_EVALS, whySheetFact } from "@/lib/cleanup/engine/fields"
import { DAY_MS } from "@/lib/cleanup/engine/fields/time"
import { durationWords, lastPlayed, plays } from "@/lib/cleanup/engine/fields/watch"
import type { EvalContext, FieldVerdict } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { ConditionOf, Duration } from "@/lib/validations/cleanup-rule"

const TAUTULLI_FAILED: FieldVerdict = { verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } }
const seconds = (iso: string) => Date.parse(iso) / 1000

/** A movie whose plays are at `at` (Unix seconds), the newest first. `null` is a failed Tautulli. */
function movie(at: number[] | null): SnapshotItem {
  if (at === null) return buildMovieItem({ plays: null })
  const lastCountedAt = at.length > 0 ? Math.max(...at) : null
  return buildMovieItem({ plays: { lastCountedAt, countedAt: at, viewers: [] } })
}

const days = (amount: number): Duration => ({ amount, unit: "days" })
const lp = (op: ConditionOf<"watch.lastPlayed">["op"], duration: Duration, orNever = true) =>
  buildCondition("watch.lastPlayed", { op, value: { duration, orNever } })
const play = (op: ConditionOf<"watch.plays">["op"], count: number, window: ConditionOf<"watch.plays">["value"]["window"] = { kind: "total" }) =>
  buildCondition("watch.plays", { op, value: { count, window } })

describe("watch.lastPlayed evaluate", () => {
  const ctx = buildEvalContext()
  it.each<[string, SnapshotItem, ConditionOf<"watch.lastPlayed">, FieldVerdict["verdict"]]>([
    ["more than: an old play passes", movie([daysAgo(400)]), lp("moreThan", days(365)), "pass"],
    ["more than: a recent play fails", movie([daysAgo(100)]), lp("moreThan", days(365)), "fail"],
    ["more than, or never: never passes", movie([]), lp("moreThan", days(365), true), "pass"],
    ["more than, not or never: never fails", movie([]), lp("moreThan", days(365), false), "fail"],
    ["more than in months: 7 months passes 6 months", movie([daysAgo(210)]), lp("moreThan", { amount: 6, unit: "months" }), "pass"],
    ["more than in years: 300 days fails 1 year", movie([daysAgo(300)]), lp("moreThan", { amount: 1, unit: "years" }), "fail"],
    ["more than in weeks: 3 weeks passes 2 weeks", movie([daysAgo(21)]), lp("moreThan", { amount: 2, unit: "weeks" }), "pass"],
    ["less than: a recent play passes", movie([daysAgo(10)]), lp("lessThan", days(30)), "pass"],
    ["less than: an old play fails", movie([daysAgo(40)]), lp("lessThan", days(30)), "fail"],
    ["less than: never fails", movie([]), lp("lessThan", days(30)), "fail"],
    ["never: no play passes", movie([]), lp("never", days(365)), "pass"],
    ["never: a play fails", movie([daysAgo(1000)]), lp("never", days(365)), "fail"],
  ])("%s", (_name, item, c, expected) => {
    expect(lastPlayed.evaluate(item, c, ctx, "condition").verdict).toBe(expected)
    expect(lastPlayed.evaluate(item, c, ctx, "protection").verdict).toBe(expected)
  })

  it("compares instants: exactly N days ago fails 'more than N days', and N days plus 1 ms passes", () => {
    const item = movie([NOW_S - 365 * 86_400])
    const c = lp("moreThan", days(365), false)
    expect(lastPlayed.evaluate(item, c, buildEvalContext({ now: NOW }), "condition")).toEqual({ verdict: "fail" })
    expect(lastPlayed.evaluate(item, c, buildEvalContext({ now: NOW + 1 }), "condition")).toEqual({ verdict: "pass" })
    const year = lp("moreThan", { amount: 1, unit: "years" }, false)
    expect(lastPlayed.evaluate(item, year, buildEvalContext({ now: NOW }), "condition").verdict).toBe("fail")
    expect(lastPlayed.evaluate(item, year, buildEvalContext({ now: NOW + 1 }), "condition").verdict).toBe("pass")
  })

  it("compares instants: exactly N days ago passes 'less than N days', and N days plus 1 ms fails", () => {
    const item = movie([NOW_S - 30 * 86_400])
    expect(lastPlayed.evaluate(item, lp("lessThan", days(30)), buildEvalContext({ now: NOW }), "condition").verdict).toBe("pass")
    expect(lastPlayed.evaluate(item, lp("lessThan", days(30)), buildEvalContext({ now: NOW + 1 }), "condition").verdict).toBe("fail")
  })

  it.each<[string, Partial<EvalContext>, SnapshotItem, FieldVerdict]>([
    ["Tautulli failed: plays null", {}, movie(null), TAUTULLI_FAILED],
    ["Tautulli failed: the source state", { sources: { ...buildEvalContext().sources, tautulli: "failed" } }, movie([daysAgo(1)]), TAUTULLI_FAILED],
    ["Tautulli not set up (TS 4.3 rule 4)", { sources: { ...buildEvalContext().sources, tautulli: "notConfigured" } }, movie([]), TAUTULLI_FAILED],
    ["the history start is unknown (X2)", { history: { startAt: null, newestAt: null } }, movie([]),
      { verdict: "unknown", cause: { kind: "noValue", what: "history" } }],
  ])("is unknown when %s, for every operator", (_name, overrides, item, expected) => {
    const ctx = buildEvalContext(overrides)
    for (const c of [lp("moreThan", days(365)), lp("lessThan", days(30)), lp("never", days(365))]) {
      expect(lastPlayed.evaluate(item, c, ctx, "condition")).toEqual(expected)
    }
  })
})

describe("watch.lastPlayed near misses and histogram", () => {
  const ctx = buildEvalContext()

  it.each<[string, SnapshotItem, ConditionOf<"watch.lastPlayed">, number | null]>([
    ["more than: the days until it passes", movie([daysAgo(300)]), lp("moreThan", days(365)), 65],
    ["more than: at least 1", movie([NOW_S - 365 * 86_400]), lp("moreThan", days(365)), 1],
    ["less than: the days since it stopped passing", movie([daysAgo(40)]), lp("lessThan", days(30)), 10],
    ["less than: at least 1", movie([daysAgo(30.5)]), lp("lessThan", days(30)), 1],
    ["never played has no gap", movie([]), lp("moreThan", days(365), false), null],
    ["the never operator has no gap", movie([daysAgo(5)]), lp("never", days(365)), null],
    ["unknown plays have no gap", movie(null), lp("moreThan", days(365)), null],
  ])("gap: %s", (_name, item, c, expected) => {
    expect(lastPlayed.gap?.(item, c, ctx)).toBe(expected)
  })

  it("forecasts the day of the last play plus N plus 1 days, in the server zone", () => {
    const at = seconds("2026-01-01T05:00:00Z") // Dec 31, 2025 in Los Angeles
    const item = movie([at])
    const c = lp("moreThan", days(365))
    expect(lastPlayed.forecast?.(item, c, buildEvalContext({ zone: "UTC" }))).toBe("2027-01-02")
    expect(lastPlayed.forecast?.(item, c, buildEvalContext({ zone: "America/Los_Angeles" }))).toBe("2027-01-01")
  })

  it.each<[string, SnapshotItem, ConditionOf<"watch.lastPlayed">]>([
    ["less than", movie([daysAgo(40)]), lp("lessThan", days(30))],
    ["never", movie([daysAgo(40)]), lp("never", days(30))],
    ["never played", movie([]), lp("moreThan", days(365), false)],
    ["unknown plays", movie(null), lp("moreThan", days(365))],
  ])("has no forecast for %s", (_name, item, c) => {
    expect(lastPlayed.forecast?.(item, c, ctx)).toBeNull()
  })

  it.each<[string, SnapshotItem, ConditionOf<"watch.lastPlayed">, Duration | null]>([
    ["more than in days, on the edge", movie([daysAgo(300)]), lp("moreThan", days(365)), days(299)],
    ["more than in days", movie([daysAgo(300.5)]), lp("moreThan", days(365)), days(300)],
    ["more than in months", movie([daysAgo(310)]), lp("moreThan", { amount: 12, unit: "months" }), { amount: 10, unit: "months" }],
    ["more than, none below 1", movie([daysAgo(200)]), lp("moreThan", { amount: 1, unit: "years" }), null],
    ["more than, at most the unit maximum", movie([daysAgo(4000)]), lp("moreThan", days(3650)), days(3650)],
    ["less than, on the edge", movie([daysAgo(40)]), lp("lessThan", days(30)), days(41)],
    ["less than", movie([daysAgo(40.5)]), lp("lessThan", days(30)), days(42)],
    ["less than in weeks", movie([daysAgo(40)]), lp("lessThan", { amount: 2, unit: "weeks" }), { amount: 7, unit: "weeks" }],
    ["less than, beyond the unit maximum", movie([daysAgo(11 * 365)]), lp("lessThan", { amount: 5, unit: "years" }), null],
    ["less than, the maximum includes it", movie([daysAgo(9.5 * 365)]), lp("lessThan", { amount: 5, unit: "years" }), { amount: 10, unit: "years" }],
    ["never played", movie([]), lp("moreThan", days(365), false), null],
    ["the never operator", movie([daysAgo(3)]), lp("never", days(365)), null],
    ["unknown plays", movie(null), lp("moreThan", days(365)), null],
  ])("try value: %s", (_name, item, c, expected) => {
    expect(lastPlayed.tryValue?.(item, c, ctx)).toEqual(expected === null ? null : { duration: expected, orNever: c.value.orNever })
  })

  it("keeps orNever in the try value", () => {
    expect(lastPlayed.tryValue?.(movie([daysAgo(300.5)]), lp("moreThan", days(365), false), ctx)).toEqual({ duration: days(300), orNever: false })
  })

  it("a try value includes the item", () => {
    for (const age of [20, 45.5, 300, 700.25]) {
      for (const c of [lp("moreThan", days(3000), false), lp("lessThan", { amount: 1, unit: "weeks" })]) {
        const value = lastPlayed.tryValue?.(movie([daysAgo(age)]), c, ctx)
        if (value) expect(lastPlayed.evaluate(movie([daysAgo(age)]), { ...c, value }, ctx, "condition").verdict).toBe("pass")
      }
    }
  })

  it("measures the days since the last play, and nothing for never or unknown", () => {
    expect(lastPlayed.measure?.(movie([daysAgo(100)]), ctx)).toBe(100)
    expect(lastPlayed.measure?.(movie([NOW_S - 1]), buildEvalContext({ now: NOW + DAY_MS / 2 }))).toBeCloseTo(0.5, 4)
    expect(lastPlayed.measure?.(movie([]), ctx)).toBeNull()
    expect(lastPlayed.measure?.(movie(null), ctx)).toBeNull()
  })
})

describe("watch.lastPlayed facts (TS 4.5)", () => {
  const march = seconds("2024-03-15T12:00:00Z")

  it("names the month in the Results and the date in the Why Sheet", () => {
    const ctx = buildEvalContext()
    expect(lastPlayed.fact(movie([march]), ctx)).toEqual([{ text: "Last played Mar 2024." }])
    expect(whySheetFact("watch.lastPlayed", movie([march]), ctx)).toEqual([{ text: "Last played Mar 15, 2024." }])
  })

  it("formats in the server zone", () => {
    const ctx = buildEvalContext({ zone: "America/Los_Angeles" })
    expect(lastPlayed.fact(movie([seconds("2024-03-01T03:00:00Z")]), ctx)).toEqual([{ text: "Last played Feb 2024." }])
  })

  it("says never, and the Why Sheet adds the history start", () => {
    const ctx = buildEvalContext({ history: { startAt: seconds("2022-06-14T12:00:00Z"), newestAt: NOW_S } })
    expect(lastPlayed.fact(movie([]), ctx)).toEqual([{ text: "Never played." }])
    expect(whySheetFact("watch.lastPlayed", movie([]), ctx)).toEqual([
      { text: "Never played." },
      { text: "No counted play since Tautulli history starts on Jun 14, 2022." },
    ])
    const noStart = buildEvalContext({ history: { startAt: null, newestAt: null } })
    expect(whySheetFact("watch.lastPlayed", movie([]), noStart)).toEqual([{ text: "Never played." }])
  })

  it("has no fact while plays are unknown", () => {
    expect(lastPlayed.fact(movie(null), buildEvalContext())).toEqual([])
    expect(whySheetFact("watch.lastPlayed", movie(null), buildEvalContext())).toEqual([])
  })
})

describe("watch.plays", () => {
  const ctx = buildEvalContext()
  const year: ConditionOf<"watch.plays">["value"]["window"] = { kind: "last", duration: days(365) }

  it.each<[string, SnapshotItem, ConditionOf<"watch.plays">, FieldVerdict["verdict"]]>([
    ["fewer than 1 in total: no play passes", movie([]), play("fewerThan", 1), "pass"],
    ["fewer than 1 in total: one play fails", movie([daysAgo(900)]), play("fewerThan", 1), "fail"],
    ["at least 3: three plays pass", movie([daysAgo(1), daysAgo(2), daysAgo(3)]), play("atLeast", 3), "pass"],
    ["at least 3: two plays fail", movie([daysAgo(1), daysAgo(2)]), play("atLeast", 3), "fail"],
    ["at least 0: no play passes", movie([]), play("atLeast", 0), "pass"],
    ["fewer than 2 in the last year: one recent play passes", movie([daysAgo(10), daysAgo(400), daysAgo(500)]), play("fewerThan", 2, year), "pass"],
    ["at least 2 in the last year: old plays do not count", movie([daysAgo(10), daysAgo(400)]), play("atLeast", 2, year), "fail"],
  ])("%s", (_name, item, c, expected) => {
    expect(plays.evaluate(item, c, ctx, "condition").verdict).toBe(expected)
  })

  it("counts a play exactly N days ago in the window, and not 1 ms later", () => {
    const item = movie([NOW_S - 365 * 86_400])
    expect(plays.evaluate(item, play("atLeast", 1, year), buildEvalContext({ now: NOW }), "condition").verdict).toBe("pass")
    expect(plays.evaluate(item, play("atLeast", 1, year), buildEvalContext({ now: NOW + 1 }), "condition").verdict).toBe("fail")
  })

  it("is unknown while Tautulli failed or is not set up", () => {
    expect(plays.evaluate(movie(null), play("fewerThan", 1), ctx, "condition")).toEqual(TAUTULLI_FAILED)
    const off = buildEvalContext({ sources: { ...ctx.sources, tautulli: "notConfigured" } })
    expect(plays.evaluate(movie([]), play("atLeast", 1), off, "protection")).toEqual(TAUTULLI_FAILED)
  })

  it("does not need the history start", () => {
    const noStart = buildEvalContext({ history: { startAt: null, newestAt: null } })
    expect(plays.evaluate(movie([]), play("fewerThan", 1), noStart, "condition").verdict).toBe("pass")
  })

  it("gives the gap |n - K| + 1 and no forecast or measure", () => {
    expect(plays.gap?.(movie([daysAgo(1), daysAgo(2), daysAgo(3)]), play("fewerThan", 1), ctx)).toBe(3)
    expect(plays.gap?.(movie([daysAgo(1)]), play("atLeast", 3), ctx)).toBe(3)
    expect(plays.gap?.(movie(null), play("atLeast", 3), ctx)).toBeNull()
    expect(plays.forecast?.(movie([]), play("atLeast", 3), ctx)).toBeNull()
    expect(plays.measure?.(movie([daysAgo(1)]), ctx)).toBeNull()
  })

  it.each<[string, SnapshotItem, ConditionOf<"watch.plays">, number | null]>([
    ["fewer than: n + 1", movie([daysAgo(1), daysAgo(2)]), play("fewerThan", 1), 3],
    ["fewer than: none above 1000", movie(Array.from({ length: 1000 }, (_, i) => daysAgo(i + 1))), play("fewerThan", 5), null],
    ["at least: n", movie([daysAgo(1), daysAgo(2)]), play("atLeast", 5), 2],
    ["at least: none for no play", movie([]), play("atLeast", 5), null],
    ["the window counts", movie([daysAgo(1), daysAgo(900)]), play("atLeast", 5, year), 1],
    ["unknown plays", movie(null), play("atLeast", 5), null],
  ])("try value: %s", (_name, item, c, count) => {
    expect(plays.tryValue?.(item, c, ctx)).toEqual(count === null ? null : { count, window: c.value.window })
  })

  it("states the plays in total, or in the condition's window (TS 4.5)", () => {
    expect(FIELD_EVALS["watch.plays"].fact(movie([]), ctx)).toEqual([{ text: "No counted play." }])
    expect(plays.fact(movie([daysAgo(3)]), ctx)).toEqual([{ text: "1 play in total." }])
    expect(plays.fact(movie([daysAgo(3), daysAgo(500)]), ctx)).toEqual([{ text: "2 plays in total." }])
    expect(plays.fact(movie(null), ctx)).toEqual([])
    const item = movie([daysAgo(3), daysAgo(5), daysAgo(500)])
    expect(conditionFact(play("fewerThan", 4, year), item, ctx)).toEqual([{ text: "2 plays in the last 365 days." }])
    expect(conditionFact(play("fewerThan", 4, { kind: "last", duration: { amount: 1, unit: "years" } }), movie([daysAgo(3)]), ctx)).toEqual([
      { text: "1 play in the last 1 year." },
    ])
    expect(conditionFact(play("fewerThan", 4, year), movie([daysAgo(500)]), ctx)).toEqual([{ text: "No counted play." }])
    expect(conditionFact(play("fewerThan", 4), item, ctx)).toEqual([{ text: "3 plays in total." }])
    expect(conditionFact(play("fewerThan", 4, year), movie(null), ctx)).toEqual([])
    expect(whySheetFact("watch.plays", item, ctx)).toEqual([{ text: "3 plays in total." }])
  })

  it.each<[Duration, string]>([
    [days(1), "1 day"],
    [days(365), "365 days"],
    [{ amount: 1, unit: "weeks" }, "1 week"],
    [{ amount: 6, unit: "months" }, "6 months"],
    [{ amount: 2, unit: "years" }, "2 years"],
  ])("duration words %j", (d, words) => {
    expect(durationWords(d)).toBe(words)
  })
})
