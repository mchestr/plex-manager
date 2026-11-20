/** The turn-on checks (TS 10.5, UX 7.13): each check state and its blocks value, steady and unsteady dry runs (X7), the Kometa notice age (X9) and each Automatic reason (UX 4.6). */

import {
  buildDefinition,
  buildOptions,
  buildSnapshotFacts,
  buildSourceStatuses,
  daysAgo,
  NOW,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { TURN_ON_CHECK_IDS, type TurnOnCheckId } from "@/lib/cleanup/constants"
import type { BlockSnapshot } from "@/lib/cleanup/rule-blocks"
import type { RuntimeNotice } from "@/lib/cleanup/schema/runtime"
import type { SnapshotFacts, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { DryRunEntry } from "@/lib/cleanup/schema/stats"
import { checkStops, dryRunSummary, modeAllowed, type TurnOnInput, turnOnChecks } from "@/lib/cleanup/turn-on"
import type { TurnOnCheck } from "@/lib/cleanup/types/rule-parts"

const HASH = "0123456789abcdef"
const HOUR = 3_600_000
const at = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
const run = (days: number, matches: number, snapshotId = `snap-${days}`, definitionHash = HASH): DryRunEntry =>
  ({ at: at(days), runId: `run-${days}`, snapshotId, matches, bytes: 0, definitionHash })

function snapshot(sources: Partial<Record<"tautulli" | "overseerr" | "radarr" | "plex", Partial<SourceStatus>>> = {}, facts: Partial<SnapshotFacts> = {}): BlockSnapshot {
  return {
    finishedAt: new Date(NOW - HOUR).toISOString(),
    sources: buildSourceStatuses({ ...sources, overseerr: { rows: 300, ...sources.overseerr }, tautulli: { rows: 5000, ...sources.tautulli } }),
    facts: buildSnapshotFacts(facts),
  }
}

const input = (overrides: Partial<TurnOnInput> = {}): TurnOnInput => ({
  now: NOW,
  feature: { enabled: true, paused: false },
  rule: { id: "r1", definition: buildDefinition() },
  snapshot: snapshot(),
  options: buildOptions(),
  dryRuns: [run(2, 191), run(1, 197)],
  definitionHash: HASH,
  counts: { count: 50, checked: 780, cannotDelete: 0 },
  firstBatch: true,
  notices: [],
  ...overrides,
})

const byId = (checks: TurnOnCheck[]) => new Map(checks.map((check) => [check.id, check]))
const checkOf = (id: TurnOnCheckId, overrides: Partial<TurnOnInput> = {}) => byId(turnOnChecks(input(overrides))).get(id)
const notice = (days: number, title = "Movies leaving soon"): RuntimeNotice =>
  ({ kind: "collectionRemoved", key: "1:movie", title, sectionId: "1", detectedAt: at(days), recreatedAt: null })

describe("turnOnChecks", () => {
  it("passes a ready rule, in page order, with no line for the checks that only show a problem", () => {
    const checks = turnOnChecks(input())
    expect(checks.map((c) => [c.id, c.state, c.blocks])).toEqual([
      ["featureOn", "ok", "all"],
      ["libraryData", "ok", "all"],
      ["historyCovers", "ok", "all"],
      ["matchedInArr", "ok", "none"],
      ["dryRuns", "ok", "none"],
      ["firstBatchSize", "ok", "automatic"],
      ["grace", "ok", "automatic"],
    ])
    expect(byId(checks).get("libraryData")?.values).toEqual({ sources: 4, readAt: buildSnapshotFacts().takenAt })
    expect(byId(checks).get("historyCovers")?.values).toEqual({ days: 365, startAt: new Date(daysAgo(3 * 365) * 1000).toISOString() })
  })

  it("lists every check in the order of TURN_ON_CHECK_IDS when each one shows", () => {
    const all = turnOnChecks(input({
      feature: { enabled: false, paused: true },
      snapshot: snapshot({}, { history: { ...buildSnapshotFacts().history, newestAt: daysAgo(20) } }),
      notices: [notice(3)],
    }))
    expect(all.map((c) => c.id)).toEqual([...TURN_ON_CHECK_IDS])
  })

  it("featureOn fails while the feature is off, and blocks every mode", () => {
    expect(checkOf("featureOn", { feature: { enabled: false, paused: false } })).toEqual({ id: "featureOn", state: "failed", blocks: "all", values: {} })
  })

  it("notPaused shows only while paused, as a failure", () => {
    expect(checkOf("notPaused")).toBeUndefined()
    expect(checkOf("notPaused", { feature: { enabled: true, paused: true } })).toMatchObject({ state: "failed", blocks: "all" })
  })

  it.each<[string, Partial<TurnOnInput>, TurnOnCheck["values"]]>([
    ["no library data", { snapshot: null }, { code: "noData" }],
    [
      "a source that the rule reads failed",
      { snapshot: snapshot({ tautulli: { state: "failed", readAt: at(0.5), errorCode: "TIMEOUT" } }) },
      { code: "sourceFailed", service: "tautulli", readAt: at(0.5), errorCode: "TIMEOUT" },
    ],
    ["data older than 36 hours", { snapshot: { ...snapshot(), finishedAt: new Date(NOW - 41 * HOUR) } }, { code: "dataStale", hours: 41 }],
    [
      "a source shrank",
      { snapshot: snapshot({ overseerr: { rows: 0 } }) },
      { code: "sourceShrank", service: "overseerr", counter: "overseerrRequests", rows: 0, previousRows: 300 },
    ],
  ])("libraryData fails: %s", (_name, overrides, values) => {
    expect(checkOf("libraryData", overrides)).toEqual({ id: "libraryData", state: "failed", blocks: "all", values })
  })

  it("tautulliPlays shows only when Tautulli recorded no play in 14 days", () => {
    expect(checkOf("tautulliPlays")).toBeUndefined()
    const stale = snapshot({}, { history: { ...buildSnapshotFacts().history, newestAt: daysAgo(15) } })
    expect(checkOf("tautulliPlays", { snapshot: stale })).toEqual({ id: "tautulliPlays", state: "failed", blocks: "all", values: {} })
  })

  it("historyCovers fails when the history is shorter than the window", () => {
    const short = snapshot({}, { history: { ...buildSnapshotFacts().history, startAt: daysAgo(100) } })
    expect(checkOf("historyCovers", { snapshot: short })).toEqual({
      id: "historyCovers", state: "failed", blocks: "all", values: { days: 365, startAt: new Date(daysAgo(100) * 1000).toISOString() },
    })
    const none = snapshot({}, { history: { ...buildSnapshotFacts().history, startAt: null } })
    expect(checkOf("historyCovers", { snapshot: none })).toEqual({ id: "historyCovers", state: "failed", blocks: "all", values: { days: 365 } })
  })

  it("historyCovers shows only for a rule that reads a Tautulli that answered", () => {
    const noTautulli = buildOptions({ protections: { g4: { enabled: false }, g5: { enabled: false }, g12: { enabled: false } } })
    const added = buildDefinition({ conditions: [{ id: "c1", field: "library.added", op: "moreThan", value: { duration: { amount: 90, unit: "days" } } }] })
    expect(checkOf("historyCovers", { rule: { definition: added }, options: noTautulli })).toBeUndefined()
    expect(checkOf("historyCovers", { snapshot: snapshot({ tautulli: { state: "failed" } }) })).toBeUndefined()
    expect(checkOf("historyCovers", { snapshot: null })).toBeUndefined()
  })

  it("matchedInArr warns when some matches are Cannot delete, and never blocks", () => {
    expect(checkOf("matchedInArr", { counts: { count: 197, checked: 780, cannotDelete: 3 } })).toEqual({
      id: "matchedInArr", state: "warning", blocks: "none", values: { service: "radarr", cannotDelete: 3 },
    })
    expect(checkOf("matchedInArr", { arr: { matchedBy: "tmdb", root: "/media/movies" } })?.values).toEqual({
      service: "radarr", count: 50, matchedBy: "tmdb", root: "/media/movies",
    })
    expect(checkOf("matchedInArr", { rule: { definition: buildDefinition({ level: "show", then: { graceDays: 30, action: "show.delete", importListExclusion: false } }) } })?.values)
      .toMatchObject({ service: "sonarr" })
  })

  it("dryRuns: info with no finished dry run of this version, blocking Automatic only", () => {
    expect(checkOf("dryRuns", { dryRuns: [] })).toEqual({ id: "dryRuns", state: "info", blocks: "automatic", values: { count: 0 } })
    expect(checkOf("dryRuns", { dryRuns: [run(1, 197, "s", "ffffffffffffffff")] })).toMatchObject({ state: "info", blocks: "automatic" })
  })

  it("dryRuns: steady matches pass, unsteady matches warn without blocking", () => {
    expect(checkOf("dryRuns")).toEqual({ id: "dryRuns", state: "ok", blocks: "none", values: { count: 2, min: 191, max: 197 } })
    expect(checkOf("dryRuns", { dryRuns: [run(3, 100), run(2, 150), run(1, 197)] })).toEqual({
      id: "dryRuns", state: "warning", blocks: "none", values: { count: 3, min: 100, max: 197 },
    })
  })

  it("firstBatchSize fails above 10 % of the checked items, for a first batch only", () => {
    expect(checkOf("firstBatchSize", { counts: { count: 78, checked: 780, cannotDelete: 0 } })?.state).toBe("ok")
    expect(checkOf("firstBatchSize", { counts: { count: 197, checked: 777, cannotDelete: 0 } })).toEqual({
      id: "firstBatchSize", state: "failed", blocks: "automatic", values: { count: 197, checked: 777 },
    })
    expect(checkOf("firstBatchSize", { counts: { count: 197, checked: 777, cannotDelete: 0 }, firstBatch: false })?.state).toBe("ok")
  })

  it("grace fails below the Automatic minimum", () => {
    const short = buildDefinition({ then: { graceDays: 6, action: "movie.delete", importListExclusion: true } })
    expect(checkOf("grace", { rule: { definition: short } })).toEqual({ id: "grace", state: "failed", blocks: "automatic", values: { graceDays: 6, min: 7 } })
    const seven = buildDefinition({ then: { graceDays: 7, action: "movie.delete", importListExclusion: true } })
    expect(checkOf("grace", { rule: { definition: seven } })?.state).toBe("ok")
    expect(checkOf("grace", { rule: { definition: seven }, options: buildOptions({ automaticMinGraceDays: 10 }) })?.values).toEqual({ graceDays: 7, min: 10 })
  })

  it("kometa warns while a removal notice is younger than 30 days, naming the newest", () => {
    expect(checkOf("kometa")).toBeUndefined()
    expect(checkOf("kometa", { notices: [notice(31)] })).toBeUndefined()
    expect(checkOf("kometa", { notices: [notice(20, "Older"), notice(29, "Oldest"), notice(2, "Shows leaving soon")] })).toEqual({
      id: "kometa", state: "warning", blocks: "none", values: { collection: "Shows leaving soon", detectedAt: at(2) },
    })
  })
})

describe("dryRunSummary (X7)", () => {
  it("counts only dry runs of the saved definition, one per library read", () => {
    const summary = dryRunSummary([run(3, 150, "a"), run(2, 190, "a"), run(1, 197, "b"), run(0, 10, "c", "ffffffffffffffff")], HASH)
    expect(summary).toEqual({ count: 2, firstAt: at(2), min: 190, max: 197, steady: true })
  })

  it("keeps the newest dry run of a library read, whatever the order", () => {
    expect(dryRunSummary([run(1, 197, "a"), run(2, 10, "a")], HASH)).toMatchObject({ count: 1, min: 197, steady: true })
  })

  it.each<[string, number[], boolean]>([
    ["within 10 % of the newest count", [180, 200, 190, 199], true],
    ["one more than 10 % away", [179, 200], false],
    ["within 5 items for a small count", [3, 8], true],
    ["more than 5 items for a small count", [2, 8], false],
    ["an old outlier beyond the newest 7", [1, 100, 100, 100, 100, 100, 100, 100], true],
    ["an outlier inside the newest 7", [100, 1, 100, 100, 100, 100, 100], false],
  ])("steady: %s", (_name, oldestFirst, steady) => {
    const runs = oldestFirst.map((matches, i) => run(oldestFirst.length - i, matches))
    expect(dryRunSummary(runs, HASH).steady).toBe(steady)
  })

  it("gives nothing for no dry run", () => {
    expect(dryRunSummary([], HASH)).toEqual({ count: 0, firstAt: null, min: null, max: null, steady: false })
  })
})

describe("checkStops", () => {
  const make = (state: TurnOnCheck["state"], blocks: TurnOnCheck["blocks"]): TurnOnCheck => ({ id: "grace", state, blocks, values: {} })
  it.each<[TurnOnCheck["state"], TurnOnCheck["blocks"], boolean, boolean]>([
    ["failed", "all", true, true],
    ["ok", "all", false, false],
    ["failed", "automatic", false, true],
    ["info", "automatic", false, true],
    ["ok", "automatic", false, false],
    ["warning", "none", false, false],
  ])("%s with blocks %s stops Review first: %s, Automatic: %s", (state, blocks, review, automatic) => {
    expect(checkStops(make(state, blocks), "reviewFirst")).toBe(review)
    expect(checkStops(make(state, blocks), "automatic")).toBe(automatic)
  })
})

describe("modeAllowed (UX 4.6 Automatic reasons)", () => {
  const modes = (overrides: Partial<TurnOnInput>, level: "movie" | "show" | "season" = "movie") => modeAllowed(turnOnChecks(input(overrides)), level)
  const short = buildDefinition({ then: { graceDays: 5, action: "movie.delete", importListExclusion: true } })
  const big = { counts: { count: 197, checked: 777, cannotDelete: 0 } }

  it("allows both modes for a ready rule", () => {
    expect(modes({})).toEqual([{ mode: "reviewFirst", allowed: true }, { mode: "automatic", allowed: true }])
  })

  it("needs one finished dry run", () => {
    expect(modes({ dryRuns: [] })[1]).toEqual({ mode: "automatic", allowed: false, reason: "Needs one finished dry run." })
  })

  it("needs the minimum grace period", () => {
    expect(modes({ rule: { definition: short } })[1]).toEqual({ mode: "automatic", allowed: false, reason: "Needs a grace period of 7 days or more." })
  })

  it("refuses a first batch above 10 % of the checked items, naming the items of the level", () => {
    expect(modes(big)[1]).toEqual({
      mode: "automatic",
      allowed: false,
      reason: "Not for this first batch, because it is more than 10 % of the movies checked (197 of 777). After the first batch, change the mode.",
    })
    expect(modes(big, "season")[1].reason).toContain("of the seasons checked")
    expect(modes(big, "show")[1].reason).toContain("of the shows checked")
  })

  it("names the first reason of UX 4.6 that applies, and never refuses Review first", () => {
    expect(modes({ dryRuns: [], rule: { definition: short }, ...big })).toEqual([
      { mode: "reviewFirst", allowed: true },
      { mode: "automatic", allowed: false, reason: "Needs one finished dry run." },
    ])
    expect(modes({ rule: { definition: short }, ...big })[1].reason).toBe("Needs a grace period of 7 days or more.")
  })

  it("does not refuse Automatic for an unsteady dry run, a warning or a check that blocks every mode", () => {
    expect(modes({ dryRuns: [run(2, 10), run(1, 197)], counts: { count: 50, checked: 780, cannotDelete: 9 }, feature: { enabled: false, paused: true } })[1])
      .toEqual({ mode: "automatic", allowed: true })
  })
})
