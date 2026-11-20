/** The stored Why (TS 3.4, TS 6.9): verdicts, facts, match and sources, the requester mapping, the schema, and no member id. */

import {
  buildCondition,
  buildDefinition,
  buildEvalContext,
  buildMovieItem,
  buildSeasonItem,
  buildShowItem,
  buildSourceStatuses,
  daysAgo,
  globalsOf,
  NOW,
  stubEvals,
  stubGlobal,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { evaluateItem } from "@/lib/cleanup/engine/evaluate"
import type { EvalContext, ItemResult } from "@/lib/cleanup/engine/types"
import { causeCode, requesterKind, type WhyMeta, whySnapshot } from "@/lib/cleanup/engine/why"
import type { SnapshotItem, SnapshotUser } from "@/lib/cleanup/schema/snapshot"
import { whySnapshotSchema } from "@/lib/cleanup/schema/why"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

// Invented plex.tv ids and app user ids that must never reach the stored Why
const MEMBER = "770001"
const FORMER = "770002"
const OWNER = "770003"
const PENDING = "770004"
const STRANGER = "770005"
const users = new Map<string, SnapshotUser>([
  [MEMBER, { hasAccess: true, lastPlayAt: daysAgo(3), owner: false }],
  [FORMER, { hasAccess: false, lastPlayAt: daysAgo(300), owner: false }],
  [OWNER, { hasAccess: true, lastPlayAt: daysAgo(1), owner: true }],
  [PENDING, { hasAccess: null, lastPlayAt: null, owner: false }],
])
const meta: WhyMeta = { snapshotId: "snap-7", takenAt: new Date(NOW - 3_600_000).toISOString(), ruleId: "rule-9", sources: buildSourceStatuses() }

function context(overrides: Partial<EvalContext> = {}): EvalContext {
  return buildEvalContext({
    users,
    memberPlexIds: new Map([["user-app-1", MEMBER], ["user-app-2", FORMER]]),
    ...overrides,
  })
}

describe("requesterKind", () => {
  it.each([
    ["no plex.tv id", null, "unknown"],
    ["an id that the snapshot users do not hold", STRANGER, "unknown"],
    ["a member with access", MEMBER, "member"],
    ["a former member", FORMER, "former"],
    ["the owner", OWNER, "owner"],
    ["an unknown access", PENDING, "unknown"],
  ] as const)("%s", (_name, by, kind) => {
    expect(requesterKind(by, { users })).toBe(kind)
  })
})

describe("causeCode", () => {
  it("writes the hold code form", () => {
    expect(causeCode({ kind: "sourceFailed", service: "overseerr" })).toBe("sourceFailed:overseerr")
    expect(causeCode({ kind: "noValue", what: "requester" })).toBe("noValue:requester")
  })
})

describe("whySnapshot", () => {
  const requested: SnapshotItem["requests"] = [MEMBER, FORMER, OWNER, PENDING, STRANGER, null].map((by, i) => ({
    at: daysAgo(100 + i), by, status: 2, is4k: false, seasons: null,
  }))

  it("stores the verdicts, the facts, the match and the sources of a movie", () => {
    const item = buildMovieItem({ requests: requested })
    const compiled = compileDefinition(buildDefinition({ protections: [buildCondition("file.size", { id: "p1" })] }))
    const ctx = context({ evals: stubEvals({ [item.key]: { p1: "fail" } }), globals: globalsOf([stubGlobal("g4")]) })
    const why = whySnapshot(compiled, evaluateItem(compiled, item, ctx), ctx, meta)
    expect(why).toEqual({
      v: 1, snapshotId: "snap-7", takenAt: meta.takenAt, checkedAt: new Date(NOW).toISOString(), ruleId: "rule-9",
      conditions: [{ id: "c1", field: "watch.lastPlayed", verdict: "pass" }],
      protections: [{ id: "g4", verdict: "clear" }, { id: "p1", verdict: "clear" }],
      facts: {
        lastCountedAt: daysAgo(200), countedTotal: 1, addedPlex: daysAgo(400), addedArr: daysAgo(401), sizeBytes: 12 * GiB,
        requests: ["member", "former", "owner", "unknown", "unknown", "unknown"].map((requester, i) => ({ at: daysAgo(100 + i), requester })),
        importList: false, showStatus: null, seasonsOnDisk: null, position: null, lastEpisodeAddedAt: null, historyStartAt: ctx.history.startAt,
      },
      match: { state: "matched", by: "tmdb", externalId: "1001", service: "radarr", arrId: 11, path: item.arr?.path },
      sources: meta.sources,
    })
    expect(whySnapshotSchema.safeParse(why).success).toBe(true)
  })

  it("holds no plex.tv id, member id or member name", () => {
    const item = buildMovieItem({ requests: requested, plays: { lastCountedAt: daysAgo(9), countedAt: [daysAgo(9)], viewers: [
      { user: MEMBER, lastCountedAt: daysAgo(9), lastCountedFinished: false, counted: 1, finished: false, finishedEpisodes: 0 },
    ] } })
    const compiled = compileDefinition(buildDefinition({ conditions: [buildCondition("request.by", { value: { requesters: [{ kind: "member", userId: "user-app-1" }] } })] }))
    const ctx = context({ live: { ...buildEvalContext().live, members: [{ userId: "user-app-1", plexUserId: MEMBER, name: "Invented Name", accessEndedAt: null }] } })
    const text = JSON.stringify(whySnapshot(compiled, evaluateItem(compiled, item, ctx), ctx, meta))
    for (const secret of [MEMBER, FORMER, OWNER, PENDING, STRANGER, "user-app-1", "user-app-2", "Invented Name"]) expect(text).not.toContain(secret)
  })

  it("stores each member of a group with its field, and each unknown cause as a code", () => {
    const plays = buildCondition("watch.plays", { id: "c2" })
    const added = buildCondition("library.added", { id: "c3" })
    const compiled = compileDefinition(buildDefinition({ conditions: [buildCondition("watch.lastPlayed"), { id: "a1", kind: "anyOf", conditions: [plays, added] }] }))
    const item = buildMovieItem()
    const ctx = context({
      evals: stubEvals({ [item.key]: { c1: { verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } }, c2: "fail",
        c3: { verdict: "unknown", cause: { kind: "noValue", what: "date" } } } }),
      globals: globalsOf([stubGlobal("g6", { [item.key]: { verdict: "unknown", cause: { kind: "noValue", what: "date" } } })]),
    })
    const why = whySnapshot(compiled, evaluateItem(compiled, item, ctx), ctx, meta)
    expect(why.conditions).toEqual([
      { id: "c1", field: "watch.lastPlayed", verdict: "unknown", cause: "sourceFailed:tautulli" },
      { id: "c2", field: "watch.plays", verdict: "fail" },
      { id: "c3", field: "library.added", verdict: "unknown", cause: "noValue:date" },
    ])
    expect(why.protections).toEqual([{ id: "g6", verdict: "unknown" }])
    expect(whySnapshotSchema.safeParse(why).success).toBe(true)
  })

  it("skips a clause row that the rule does not name", () => {
    const compiled = compileDefinition(buildDefinition())
    const stale: ItemResult = { item: buildMovieItem(), clauses: [{ id: "c1", verdict: "pass" }, { id: "c8", verdict: "fail" }], members: {}, protections: [],
      match: { state: "matched", by: "tmdb" } }
    expect(whySnapshot(compiled, stale, context(), meta).conditions).toEqual([{ id: "c1", field: "watch.lastPlayed", verdict: "pass" }])
  })

  it("stores the show facts of a season, and the external id that the match used", () => {
    const base = buildShowItem()
    const show = buildShowItem({ arr: base.arr && { ...base.arr, importList: true } })
    const season = buildSeasonItem(show, 2, { match: { state: "matched", by: "tvdb" } })
    const compiled = compileDefinition(buildDefinition({ level: "season", libraries: ["2"], conditions: [buildCondition("season.position")],
      then: { graceDays: 30, action: "season.unmonitorDeleteFiles", importListExclusion: false } }))
    const ctx = context()
    const why = whySnapshot(compiled, evaluateItem(compiled, season, ctx), ctx, meta)
    expect(why.facts).toMatchObject({ showStatus: "ended", seasonsOnDisk: 3, position: 2, lastEpisodeAddedAt: daysAgo(500), importList: true, requests: [] })
    expect(why.match).toEqual({ state: "matched", by: "tvdb", externalId: "2002", service: "sonarr", arrId: 22, path: show.arr?.path })
    expect(whySnapshotSchema.safeParse(why).success).toBe(true)
  })

  it("stores a failed read as null facts, and an unmatched item with no arr record", () => {
    const item = buildMovieItem({ plays: null, requests: null, arr: null, sizeBytes: null, added: { plex: daysAgo(5), arr: null },
      ids: { imdb: "tt0000009" }, match: { state: "unmatched", cause: "noArrRecord", by: "imdb" } })
    const ctx = context({ history: { startAt: null, newestAt: null } })
    const compiled = compileDefinition(buildDefinition())
    const why = whySnapshot(compiled, evaluateItem(compiled, item, ctx), ctx, { ...meta, sources: [] })
    expect(why.facts).toMatchObject({ lastCountedAt: null, countedTotal: null, sizeBytes: null, requests: [], importList: false, addedArr: null, historyStartAt: null })
    expect(why.match).toEqual({ state: "unmatched", by: "imdb", externalId: "tt0000009" })
    expect(why.sources).toEqual([])
    expect(whySnapshotSchema.safeParse(why).success).toBe(true)
  })

  it("leaves out the external id when the match used none, or the item lacks that id", () => {
    const compiled = compileDefinition(buildDefinition())
    const none = buildMovieItem({ match: { state: "unknown" } })
    const missing = buildMovieItem({ ids: { imdb: "tt0000010" }, match: { state: "matched", by: "tmdb" } })
    expect(whySnapshot(compiled, evaluateItem(compiled, none, context()), context(), meta).match).toEqual({ state: "unknown", service: "radarr", arrId: 11, path: none.arr?.path })
    expect(whySnapshot(compiled, evaluateItem(compiled, missing, context()), context(), meta).match).not.toHaveProperty("externalId")
  })

  it("does not share the source rows of the caller", () => {
    const compiled = compileDefinition(buildDefinition())
    const why = whySnapshot(compiled, evaluateItem(compiled, buildMovieItem(), context()), context(), meta)
    why.sources[0].state = "failed"
    expect(meta.sources[0].state).toBe("ok")
  })
})
