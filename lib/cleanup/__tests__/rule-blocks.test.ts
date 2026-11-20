/** The safety stops of a live rule (TS 8.2): each block and its order, services not set up, `windowDays` for each source row and the shrink check against `rowBaseline`. */

import {
  buildCondition,
  buildDefinition,
  buildOptions,
  buildSnapshotFacts,
  buildSourceStatuses,
  daysAgo,
  NOW,
} from "@/lib/cleanup/__tests__/helpers/builders"
import type { CompiledRule } from "@/lib/cleanup/engine/types"
import { type BlockSnapshot, ruleBlocks, ruleSources, sourceShrank, windowDays } from "@/lib/cleanup/rule-blocks"
import { isShrink } from "@/lib/cleanup/snapshot/baseline"
import type { SnapshotFacts, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { Condition, RuleDefinition } from "@/lib/validations/cleanup-rule"
import type { Service } from "@/lib/validations/cleanup-vocabulary"

const HOUR = 3_600_000
const READ_AT = new Date(NOW - HOUR).toISOString()
const options = buildOptions()
/** Every global protection with a service or a window off. */
const bare = buildOptions({
  protections: Object.fromEntries(["g4", "g5", "g7", "g8", "g9", "g11", "g12"].map((id) => [id, { enabled: false }])),
})

const snapshot = (
  overrides: { finishedAt?: string; sources?: Partial<Record<Service, Partial<SourceStatus>>>; extra?: SourceStatus[]; facts?: Partial<SnapshotFacts> } = {},
): BlockSnapshot => {
  // The row counts agree with the builder's baseline, so a fresh snapshot shrank nothing
  const { overseerr, tautulli, ...rest } = overrides.sources ?? {}
  const sources = { ...rest, overseerr: { rows: 300, ...overseerr }, tautulli: { rows: 5000, ...tautulli } }
  return {
    finishedAt: overrides.finishedAt ?? new Date(NOW - HOUR).toISOString(),
    sources: [...buildSourceStatuses(sources), ...(overrides.extra ?? [])],
    facts: buildSnapshotFacts(overrides.facts),
  }
}
const history = (patch: Partial<SnapshotFacts["history"]>) => ({ history: { ...buildSnapshotFacts().history, ...patch } })
const blocksOf = (def: RuleDefinition, snap: BlockSnapshot | null, opts = options) => ruleBlocks(def, snap, { now: NOW, options: opts })
const movieRule = buildDefinition() // watch.lastPlayed more than 365 days, or never
const addedOnly = buildDefinition({ conditions: [buildCondition("library.added")] })

describe("ruleBlocks", () => {
  it("passes a rule on fresh, complete data", () => {
    expect(blocksOf(movieRule, snapshot())).toEqual([])
  })

  it("1 noData: no complete snapshot, alone", () => {
    expect(blocksOf(movieRule, null)).toEqual([{ code: "noData" }])
  })

  it("2 dataStale: finished more than 36 hours ago, with its hours", () => {
    expect(blocksOf(addedOnly, snapshot({ finishedAt: new Date(NOW - 41.5 * HOUR).toISOString() }), bare)).toEqual([{ code: "dataStale", hours: 41 }])
    expect(blocksOf(addedOnly, { ...snapshot(), finishedAt: new Date(NOW - 36 * HOUR) }, bare)).toEqual([])
  })

  it("3 sourceFailed: a service the rule reads, with its read time and error code", () => {
    const snap = snapshot({ sources: { radarr: { state: "failed", readAt: READ_AT, errorCode: "TIMEOUT" } } })
    expect(blocksOf(addedOnly, snap, bare)).toEqual([{ code: "sourceFailed", service: "radarr", readAt: READ_AT, errorCode: "TIMEOUT" }])
  })

  it("3 sourceFailed: a plex.tv share list with no owner counts as Plex and keeps NO_OWNER", () => {
    const shares: SourceStatus = { service: "plex", part: "shares", state: "failed", readAt: null, errorCode: "NO_OWNER" }
    expect(blocksOf(addedOnly, snapshot({ extra: [shares] }), bare)).toEqual([{ code: "sourceFailed", service: "plex", errorCode: "NO_OWNER" }])
  })

  it("3 sourceFailed: a failed service that the rule does not read stops nothing", () => {
    expect(blocksOf(addedOnly, snapshot({ sources: { overseerr: { state: "failed" }, sonarr: { state: "failed" } } }), bare)).toEqual([])
  })

  it("4 tautulliStale: no play in more than 14 days, or no newest play", () => {
    expect(blocksOf(movieRule, snapshot({ facts: history({ newestAt: daysAgo(15) }) }))).toEqual([{ code: "tautulliStale" }])
    expect(blocksOf(movieRule, snapshot({ facts: history({ newestAt: null }) }))).toEqual([{ code: "tautulliStale" }])
    expect(blocksOf(movieRule, snapshot({ facts: history({ newestAt: daysAgo(13.9) }) }))).toEqual([])
  })

  it("5 historyShort: the history starts after now minus the window, or has no start", () => {
    expect(blocksOf(movieRule, snapshot({ facts: history({ startAt: daysAgo(300) }) }))).toEqual([{ code: "historyShort", days: 365 }])
    expect(blocksOf(movieRule, snapshot({ facts: history({ startAt: null }) }))).toEqual([{ code: "historyShort", days: 365 }])
    expect(blocksOf(movieRule, snapshot({ facts: history({ startAt: daysAgo(366) }) }))).toEqual([])
  })

  it("4 and 5 need Tautulli: a rule that does not read it skips them", () => {
    expect(blocksOf(addedOnly, snapshot({ facts: history({ newestAt: null, startAt: null }) }), bare)).toEqual([])
  })

  it("a failed Tautulli gives its sourceFailed stop only", () => {
    const snap = snapshot({ sources: { tautulli: { state: "failed", readAt: READ_AT, rows: 0 } }, facts: history({ newestAt: null, startAt: null, usersWithPlay: 0 }) })
    expect(blocksOf(movieRule, snap)).toEqual([{ code: "sourceFailed", service: "tautulli", readAt: READ_AT }])
  })

  it("leaves out a service that is not set up: no stop for it", () => {
    const snap = snapshot({ sources: { tautulli: { state: "notConfigured", rows: undefined } }, facts: history({ newestAt: null, startAt: null }) })
    expect(blocksOf(movieRule, snap)).toEqual([])
  })

  it("returns every block that applies, in the order of TS 8.2, each with the rule id", () => {
    const snap = snapshot({
      finishedAt: new Date(NOW - 40 * HOUR).toISOString(),
      sources: { overseerr: { state: "failed", readAt: READ_AT }, tautulli: { rows: 100 } },
      facts: { ...history({ newestAt: daysAgo(20), startAt: daysAgo(10) }), rowBaseline: { tautulliRows: 5000, overseerrRequests: 300 } },
    })
    expect(ruleBlocks(movieRule, snap, { now: NOW, options, ruleId: "r1" })).toEqual([
      { code: "dataStale", hours: 40, ruleId: "r1" },
      { code: "sourceFailed", service: "overseerr", readAt: READ_AT, ruleId: "r1" },
      { code: "tautulliStale", ruleId: "r1" },
      { code: "historyShort", days: 365, ruleId: "r1" },
      { code: "sourceShrank", service: "tautulli", counter: "tautulliRows", rows: 100, previousRows: 5000, ruleId: "r1" },
    ])
    expect(ruleBlocks(movieRule, null, { now: NOW, options, ruleId: "r1" })).toEqual([{ code: "noData", ruleId: "r1" }])
  })

  it("reads a compiled draft as well as a stored definition", () => {
    const compiled: Pick<CompiledRule, "scope" | "clauses" | "protections"> = {
      scope: { level: "movie", libraries: ["1"] },
      clauses: [{ kind: "group", id: "a1", conditions: [buildCondition("library.added", { id: "c1" }), buildCondition("watch.plays", { id: "c2" })] }],
      protections: [],
    }
    expect(ruleBlocks(compiled, snapshot({ facts: history({ newestAt: null }) }), { now: NOW, options: bare })).toEqual([{ code: "tautulliStale" }])
    const single = { ...compiled, clauses: [{ kind: "condition" as const, id: "c1", condition: buildCondition("library.added") }] }
    expect(ruleSources(single, bare)).toEqual(["plex", "radarr"])
  })
})

describe("sourceShrank against rowBaseline (TS 8.2 step 6)", () => {
  const all: Service[] = ["plex", "tautulli", "overseerr", "radarr"]
  const snap = (rows: Partial<Record<"overseerr" | "tautulli", number | undefined>>, usersWithPlay: number, rowBaseline: SnapshotFacts["rowBaseline"]) =>
    snapshot({ sources: { overseerr: { rows: rows.overseerr }, tautulli: { rows: rows.tautulli } }, facts: { ...history({ usersWithPlay }), rowBaseline } })

  it.each<[string, number, number, boolean]>([
    ["a fall of more than 10 %", 269, 300, true],
    ["a fall of exactly 10 %", 270, 300, false],
    ["a fall to 0", 0, 300, true],
    ["0 against a baseline of 0", 0, 0, false],
    ["a rise", 400, 300, false],
  ])("%s", (_name, rows, baseline, shrank) => {
    expect(isShrink(rows, baseline)).toBe(shrank)
    const blocks = sourceShrank(snap({ overseerr: rows, tautulli: 5000 }, 12, { overseerrRequests: baseline, tautulliRows: 5000, usersWithPlay: 12 }), all)
    expect(blocks).toEqual(shrank ? [{ code: "sourceShrank", service: "overseerr", counter: "overseerrRequests", rows, previousRows: baseline }] : [])
  })

  it("checks the members with a play, from the facts", () => {
    expect(sourceShrank(snap({ overseerr: 300, tautulli: 5000 }, 0, { usersWithPlay: 41 }), all)).toEqual([
      { code: "sourceShrank", service: "tautulli", counter: "usersWithPlay", rows: 0, previousRows: 41 },
    ])
  })

  it("passes without a baseline (one snapshot only)", () => {
    expect(sourceShrank(snap({ overseerr: 0, tautulli: 0 }, 0, {}), all)).toEqual([])
  })

  it("checks only the services the rule reads, with a count", () => {
    const fallen = snap({ overseerr: 0, tautulli: undefined }, 0, { overseerrRequests: 300, tautulliRows: 5000, usersWithPlay: 12 })
    expect(sourceShrank(fallen, ["plex", "radarr"])).toEqual([])
    expect(sourceShrank(fallen, ["plex", "tautulli", "radarr"])).toEqual([
      { code: "sourceShrank", service: "tautulli", counter: "usersWithPlay", rows: 0, previousRows: 12 },
    ])
  })
})

describe("ruleSources", () => {
  it("holds Plex, the level's arr, the field sources and the enabled global needs", () => {
    expect(ruleSources(movieRule, options)).toEqual(["plex", "tautulli", "overseerr", "radarr"])
    expect(ruleSources(movieRule, bare)).toEqual(["plex", "tautulli", "radarr"])
    expect(ruleSources(addedOnly, bare)).toEqual(["plex", "radarr"])
  })

  it("adds the needs of the season-only protections G11 and G12 for seasons only", () => {
    const seasonOnly = buildOptions({ protections: { ...bare.protections, g11: { enabled: true }, g12: { enabled: true, days: 365 } } })
    expect(ruleSources(buildDefinition({ level: "season", conditions: [buildCondition("library.added")] }), seasonOnly)).toEqual(["plex", "tautulli", "sonarr"])
    expect(ruleSources(buildDefinition({ level: "show", conditions: [buildCondition("library.added")] }), seasonOnly)).toEqual(["plex", "sonarr"])
  })

  it("adds the arr of the level for G9, Plex for G8 and G13", () => {
    const g9 = buildOptions({ protections: { ...bare.protections, g9: { enabled: true }, g13: { enabled: true, collections: ["A"] } } })
    expect(ruleSources(buildDefinition({ level: "show", conditions: [buildCondition("show.lastEpisodeAdded")] }), g9)).toEqual(["plex", "sonarr"])
  })

  it("adds Tautulli for a requester inactive for some days", () => {
    const inactive = buildCondition("request.by", { op: "anyOf", value: { requesters: [{ kind: "inactive", days: 90 }] } })
    expect(ruleSources(buildDefinition({ conditions: [inactive] }), bare)).toEqual(["plex", "tautulli", "overseerr", "radarr"])
    expect(ruleSources(buildDefinition({ conditions: [buildCondition("request.by")] }), bare)).toEqual(["plex", "overseerr", "radarr"])
  })

  it("reads group members and rule protections", () => {
    const def = buildDefinition({
      conditions: [{ id: "a1", kind: "anyOf", conditions: [buildCondition("library.added", { id: "c1" }), buildCondition("request.age", { id: "c2" })] }],
      protections: [buildCondition("watch.plays", { id: "p1", op: "atLeast" })],
    })
    expect(ruleSources(def, bare)).toEqual(["plex", "tautulli", "overseerr", "radarr"])
  })

  it("leaves out services that are not set up", () => {
    const sources = buildSourceStatuses({ tautulli: { state: "notConfigured" }, overseerr: { state: "notConfigured" } })
    expect(ruleSources(movieRule, options, sources)).toEqual(["plex", "radarr"])
  })
})

describe("windowDays", () => {
  const lp = (op: "moreThan" | "lessThan" | "never", amount: number, orNever: boolean) =>
    buildCondition("watch.lastPlayed", { op, value: { duration: { amount, unit: "days" }, orNever } })
  it.each<[string, Condition, number]>([
    ["watch.lastPlayed more than N", lp("moreThan", 180, false), 180],
    ["watch.lastPlayed more than N, or never", lp("moreThan", 180, true), 365],
    ["watch.lastPlayed more than N, or never, above the never window", lp("moreThan", 730, true), 730],
    ["watch.lastPlayed less than N", lp("lessThan", 45, true), 45],
    ["watch.lastPlayed never", lp("never", 10, true), 365],
    ["watch.plays total", buildCondition("watch.plays"), 365],
    ["watch.plays last N", buildCondition("watch.plays", { value: { count: 2, window: { kind: "last", duration: { amount: 6, unit: "months" } } } }), 180],
    ["request.requesters", buildCondition("request.requesters"), 365],
    ["request.by inactive N", buildCondition("request.by", { value: { requesters: [{ kind: "former" }, { kind: "inactive", days: 400 }] } }), 400],
    ["request.by without inactive", buildCondition("request.by"), 0],
    ["a field with no window", buildCondition("file.size"), 0],
  ])("%s", (_name, condition, days) => {
    expect(windowDays(buildDefinition({ conditions: [condition] }), bare)).toBe(days)
  })

  it("takes the days of G4, G5, G7 and G12 when enabled in the level", () => {
    const only = (id: "g4" | "g5" | "g7" | "g12", days: number) => buildOptions({ protections: { ...bare.protections, [id]: { enabled: true, days } } })
    const def = buildDefinition({ conditions: [buildCondition("file.size")] })
    expect(windowDays(def, only("g4", 40))).toBe(40)
    expect(windowDays(def, only("g5", 200))).toBe(200)
    expect(windowDays(def, only("g7", 90))).toBe(90)
    expect(windowDays(def, only("g12", 500))).toBe(0)
    expect(windowDays(buildDefinition({ level: "season", conditions: [buildCondition("file.size")] }), only("g12", 500))).toBe(500)
    expect(windowDays(def, options)).toBe(180)
  })

  it("takes the largest window of every condition and protection", () => {
    const def = buildDefinition({ conditions: [lp("lessThan", 45, false)], protections: [buildCondition("watch.plays", { id: "p1", op: "atLeast" })] })
    expect(windowDays(def, bare)).toBe(365)
  })
})
