/** `buildEvalContext()` (TS 4.1, D1): source states, the share list, `showsByKey`, `memberPlexIds` and the injected evaluators. */

import {
  buildCondition,
  buildLiveFacts,
  buildMovieItem,
  buildOptions,
  buildSeasonItem,
  buildShowItem,
  buildSnapshotFacts,
  buildSourceStatuses,
  daysAgo,
  NOW,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { buildEvalContext, type EvalContextInput } from "@/lib/cleanup/engine/context"
import { FIELD_EVALS } from "@/lib/cleanup/engine/fields"
import { evaluateGlobal, globalProtections } from "@/lib/cleanup/engine/protections"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import { FIELD_IDS } from "@/lib/validations/cleanup-vocabulary"

const show = buildShowItem()
const MEMBERS = [
  { userId: "u-avery", plexUserId: "100", name: "Avery Example", accessEndedAt: null },
  { userId: "u-casey", plexUserId: null, name: "Casey Example", accessEndedAt: null },
]

function input(overrides: Partial<EvalContextInput> = {}): EvalContextInput {
  return {
    now: NOW,
    zone: "UTC",
    facts: buildSnapshotFacts(),
    sources: buildSourceStatuses(),
    shows: [show],
    live: buildLiveFacts({ members: MEMBERS }),
    options: buildOptions(),
    ...overrides,
  }
}

describe("buildEvalContext", () => {
  it("sets the clock and the day key in the server zone", () => {
    const late = Date.parse("2026-11-09T03:00:00.000Z")
    expect(buildEvalContext(input()).today).toBe("2026-11-08")
    const ctx = buildEvalContext(input({ now: late, zone: "America/Los_Angeles" }))
    expect(ctx).toMatchObject({ now: late, zone: "America/Los_Angeles", today: "2026-11-08" })
    expect(buildEvalContext(input({ now: late, zone: "Europe/Berlin" })).today).toBe("2026-11-09")
  })

  it("takes each service's state from its source status, and reads a missing status as failed", () => {
    const ctx = buildEvalContext(input({ sources: buildSourceStatuses({ overseerr: { state: "failed" }, sonarr: { state: "notConfigured" } }) }))
    expect(ctx.sources).toEqual({ plex: "ok", tautulli: "ok", overseerr: "failed", radarr: "ok", sonarr: "notConfigured" })
    const partial = buildSourceStatuses().filter((s) => s.service !== "radarr")
    expect(buildEvalContext(input({ sources: partial })).sources.radarr).toBe("failed")
  })

  it("keeps the plex.tv share list apart from the Plex server state", () => {
    const shares: SourceStatus = { service: "plex", part: "shares", state: "failed", readAt: null, errorCode: "NO_OWNER" }
    const ctx = buildEvalContext(input({ sources: [...buildSourceStatuses(), shares] }))
    expect(ctx.sources.plex).toBe("ok")
    expect(ctx.shares).toBe("failed")
    const ok: SourceStatus = { service: "plex", part: "shares", state: "ok", readAt: null }
    const unknownAccess = buildSnapshotFacts({ users: { "100": { hasAccess: null, lastPlayAt: null, owner: false } } })
    expect(buildEvalContext(input({ sources: [...buildSourceStatuses(), ok], facts: unknownAccess })).shares).toBe("ok")
  })

  it("derives the share list state when no status names it", () => {
    expect(buildEvalContext(input()).shares).toBe("ok")
    const unknownAccess = buildSnapshotFacts({ users: { "100": { hasAccess: null, lastPlayAt: null, owner: false } } })
    expect(buildEvalContext(input({ facts: unknownAccess })).shares).toBe("failed")
    const noPlex = buildSourceStatuses({ plex: { state: "notConfigured" } })
    expect(buildEvalContext(input({ facts: unknownAccess, sources: noPlex })).shares).toBe("notConfigured")
  })

  it("copies the history and the users", () => {
    const ctx = buildEvalContext(input())
    const facts = buildSnapshotFacts()
    expect(ctx.history).toEqual({ startAt: facts.history.startAt, newestAt: facts.history.newestAt })
    expect(ctx.users.get("100")).toEqual(facts.users["100"])
    expect(ctx.users.get("1")?.owner).toBe(true)
    expect(ctx.users.size).toBe(2)
  })

  it("fills memberPlexIds from the live facts, leaving out members with no Plex account", () => {
    const ctx = buildEvalContext(input())
    expect([...ctx.memberPlexIds]).toEqual([["u-avery", "100"]])
    const c = buildCondition("request.by", { op: "only", value: { requesters: [{ kind: "member", userId: "u-avery" }] } })
    const item = buildMovieItem({ requests: [{ at: daysAgo(5), by: "100", status: 2, is4k: false, seasons: null }] })
    expect(ctx.evals["request.by"].evaluate(item, c, ctx, "condition").verdict).toBe("pass")
  })

  it("fills showsByKey from the show items only, and season items read their show through it", () => {
    const movie = buildMovieItem()
    const seasonItem = buildSeasonItem(show, 2, { ids: {} })
    const ctx = buildEvalContext(input({ shows: new Set([show, movie, seasonItem]), live: buildLiveFacts({ watchlist: {
      tmdb: new Set(), tvdb: new Set([2002]), imdb: new Set() } }) }))
    expect([...ctx.showsByKey.keys()]).toEqual([show.key])
    expect(ctx.showsByKey.get(show.key)).toBe(show)
    expect(evaluateGlobal("g8", seasonItem, ctx).verdict).toBe("protects")
    expect(evaluateGlobal("g8", seasonItem, buildEvalContext(input({ shows: [] }))).verdict).toBe("clear")
  })

  it("injects the field evaluators, one for each field (D1)", () => {
    const ctx = buildEvalContext(input())
    expect(ctx.evals).toBe(FIELD_EVALS)
    for (const id of FIELD_IDS) expect(ctx.evals[id].id).toBe(id)
    expect(Object.keys(ctx.evals).sort()).toEqual([...FIELD_IDS].sort())
    const neverPlayed = buildMovieItem({ plays: { lastCountedAt: null, countedAt: [], viewers: [] } })
    expect(ctx.evals["watch.lastPlayed"].evaluate(neverPlayed, buildCondition("watch.lastPlayed"), ctx, "condition").verdict).toBe("pass")
  })

  it("injects the enabled global protections of each level, built once per level (D1)", () => {
    const options = buildOptions({ protections: { g2: { enabled: false } } })
    const ctx = buildEvalContext(input({ options }))
    for (const level of ["movie", "show", "season"] as const) {
      expect(ctx.globals(level).map((g) => g.id)).toEqual(globalProtections(level, options).map((g) => g.id))
    }
    expect(ctx.globals("movie")).toBe(ctx.globals("movie"))
    expect(ctx.globals("season")).toHaveLength(11)
    expect(ctx.options).toBe(options)
  })

  it("gives G13 the collection titles that the library read listed", () => {
    const options = buildOptions({ protections: { g13: { enabled: true, collections: ["Christmas"] } } })
    const read = buildEvalContext(input({ options, facts: buildSnapshotFacts({ membersRead: ["christmas"] }) }))
    const notRead = buildEvalContext(input({ options, facts: buildSnapshotFacts({ membersRead: [] }) }))
    expect(evaluateGlobal("g13", buildMovieItem(), read).verdict).toBe("clear")
    expect(evaluateGlobal("g13", buildMovieItem(), notRead).verdict).toBe("unknown")
    expect(evaluateGlobal("g13", buildMovieItem({ collections: ["Christmas"] }), notRead).verdict).toBe("protects")
  })
})
