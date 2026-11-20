/** Global protections (TS 5.3, 5.4, E30, X10): G1 to G13 protect, clear, unknown and inert, and the cascade of item keys. */

import {
  buildEvalContext,
  buildLiveFacts,
  buildMovieItem,
  buildOptions,
  buildSeasonItem,
  buildShowItem,
  daysAgo,
  NOW,
  NOW_S,
} from "@/lib/cleanup/__tests__/helpers/builders"
import { coversKey, evaluateGlobal, GLOBAL_LEVELS, globalProtections, isGlobalEnabled, protectionKeys } from "@/lib/cleanup/engine/protections"
import type { EvalContext, GlobalProtectionId, LiveFacts, ProtectionState, ProtectionVerdict } from "@/lib/cleanup/engine/types"
import type { RequestFact, SnapshotItem, SnapshotUser, Viewer } from "@/lib/cleanup/schema/snapshot"
import type { cleanupOptionsSchema } from "@/lib/validations/cleanup-options"
import type { z } from "zod"

type OptionsInput = z.input<typeof cleanupOptionsSchema>
const DAY = 86_400_000
const USERS = new Map<string, SnapshotUser>([
  ["100", { hasAccess: true, lastPlayAt: daysAgo(1), owner: false }],
  ["200", { hasAccess: false, lastPlayAt: daysAgo(400), owner: false }],
  ["300", { hasAccess: null, lastPlayAt: null, owner: false }],
])

/** A context whose global protections are the real ones, built from `options` (D1). */
function context(overrides: Partial<EvalContext> = {}, options: OptionsInput = {}, membersRead: string[] = []): EvalContext {
  const parsed = buildOptions(options)
  return buildEvalContext({ users: USERS, options: parsed, globals: (level) => globalProtections(level, parsed, { membersRead }), ...overrides })
}
const live = (overrides: Partial<LiveFacts>) => context({ live: buildLiveFacts(overrides) })
const verdict = (id: GlobalProtectionId, item: SnapshotItem, ctx: EvalContext): ProtectionState => evaluateGlobal(id, item, ctx).verdict
const factOf = (id: GlobalProtectionId, item: SnapshotItem, ctx: EvalContext) =>
  ctx.globals(item.level).find((g) => g.id === id)?.fact?.(item, ctx).map((p) => p.text).join(" ")
const sources = (overrides: Partial<EvalContext["sources"]>) => ({ ...buildEvalContext().sources, ...overrides })

const show = buildShowItem()
const season = (n: number, overrides: Partial<SnapshotItem> = {}) => buildSeasonItem(show, n, overrides)
const withShow = (overrides: Partial<EvalContext> = {}, options: OptionsInput = {}, membersRead: string[] = []) =>
  context({ showsByKey: new Map([[show.key, show]]), ...overrides }, options, membersRead)
const viewer = (user: string, overrides: Partial<Viewer> = {}): Viewer => ({
  user, lastCountedAt: daysAgo(10), lastCountedFinished: false, counted: 1, finished: false, finishedEpisodes: 0, ...overrides,
})
const newestOf = (viewers: Viewer[]) => viewers.reduce<number | null>((a, v) => (v.lastCountedAt !== null && (a === null || v.lastCountedAt > a) ? v.lastCountedAt : a), null)
const played = (item: SnapshotItem, viewers: Viewer[]): SnapshotItem => ({ ...item, plays: { lastCountedAt: newestOf(viewers), countedAt: [], viewers } })
type ShowFacts = NonNullable<SnapshotItem["show"]>
const showFacts = (overrides: Partial<ShowFacts> = {}): ShowFacts => ({
  status: "ended", seasonsOnDisk: 3, newestSeasonOnDisk: 3, lastEpisodeAddedAt: daysAgo(500), ...overrides,
})
const req = (overrides: Partial<RequestFact> = {}): RequestFact => ({ at: daysAgo(10), by: "100", status: 2, is4k: false, seasons: null, ...overrides })

describe("globalProtections (TS 5.3)", () => {
  it("lists the enabled protections of each level in Settings order: 10 for movies and shows, 12 for seasons", () => {
    const options = buildOptions()
    expect(globalProtections("movie", options).map((g) => g.id)).toEqual(["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10"])
    expect(globalProtections("show", options)).toHaveLength(10)
    expect(globalProtections("season", options).map((g) => g.id)).toEqual(["g1", "g2", "g3", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12"])
  })

  it("keeps G1 and G3 on, follows every other enabled option, and counts G13 while enabled", () => {
    const off = Object.fromEntries(["g2", "g4", "g5", "g6", "g7", "g8", "g9", "g10", "g11", "g12"].map((id) => [id, { enabled: false }]))
    expect(globalProtections("season", buildOptions({ protections: off })).map((g) => g.id)).toEqual(["g1", "g3"])
    const g13 = buildOptions({ protections: { g13: { enabled: true, collections: ["Christmas"] } } })
    expect(globalProtections("movie", g13).map((g) => g.id).at(-1)).toBe("g13")
    expect(globalProtections("season", g13)).toHaveLength(13)
    expect(isGlobalEnabled("g1", buildOptions({ members: { keepsEnabled: false } }))).toBe(true)
    expect(isGlobalEnabled("g3", buildOptions())).toBe(true)
    expect(isGlobalEnabled("g13", buildOptions())).toBe(false)
  })

  it("names the levels of each protection, with G8, G9, G10 and G13 on seasons through their show (X10)", () => {
    expect(GLOBAL_LEVELS.g11).toEqual(["season"])
    expect(GLOBAL_LEVELS.g12).toEqual(["season"])
    for (const id of ["g8", "g9", "g10", "g13"] as const) expect(GLOBAL_LEVELS[id]).toContain("season")
    for (const level of ["movie", "show", "season"] as const) {
      for (const g of globalProtections(level, buildOptions())) expect(g.levels).toContain(level)
    }
    expect(globalProtections("movie", buildOptions()).find((g) => g.id === "g9")?.needs).toEqual(["radarr"])
    expect(globalProtections("season", buildOptions()).find((g) => g.id === "g9")?.needs).toEqual(["sonarr"])
  })

  it("gives clear for a protection that is off or does not apply to the level", () => {
    const ctx = context({}, { protections: { g4: { enabled: false } } })
    expect(evaluateGlobal("g4", played(buildMovieItem(), [viewer("100", { lastCountedAt: daysAgo(1) })]), ctx)).toEqual({ verdict: "clear" })
    expect(evaluateGlobal("g11", buildMovieItem(), ctx)).toEqual({ verdict: "clear" })
  })
})

describe("the cascade of TS 5.4", () => {
  it.each<[string, SnapshotItem, string, boolean]>([
    ["a movie matches itself", buildMovieItem(), "movie:tmdb:1001", true],
    ["a movie does not match a show with its TMDB id", buildMovieItem(), "show:tmdb:1001", false],
    ["a show matches itself", show, "show:tvdb:2002", true],
    ["a show matches each of its seasons", show, "season:tvdb:2002:4", true],
    ["a show matches a two-digit season", show, "season:tvdb:2002:12", true],
    ["a show does not match another show's season", show, "season:tvdb:20021:4", false],
    ["a show does not match a key with no season number", show, "season:tvdb:2002:x", false],
    ["a season matches itself", season(2), "season:tvdb:2002:2", true],
    ["a season matches its show", season(2), "show:tvdb:2002", true],
    ["a season does not match another season", season(2), "season:tvdb:2002:3", false],
  ])("%s", (_name, item, key, expected) => {
    expect(coversKey(protectionKeys(item), key)).toBe(expected)
  })

  it("lists the item's own keys", () => {
    expect(protectionKeys(buildMovieItem())).toEqual({ keys: ["movie:tmdb:1001"], seasonPrefix: null })
    expect(protectionKeys(show)).toEqual({ keys: ["show:tvdb:2002"], seasonPrefix: "season:tvdb:2002:" })
    expect(protectionKeys(season(4))).toEqual({ keys: ["season:tvdb:2002:4", "show:tvdb:2002"], seasonPrefix: null })
  })
})

describe("G1 member Keeps (E30)", () => {
  const keep = (itemKey: string, expiresAt = new Date(NOW + 30 * DAY), memberId = "u-avery") => ({ id: `k-${itemKey}`, itemKey, memberId, expiresAt })
  const members = [{ userId: "u-avery", plexUserId: "100", name: "Avery Example", accessEndedAt: null }]

  it.each<[string, SnapshotItem, LiveFacts["keeps"], ProtectionState]>([
    ["a Keep on the movie protects", buildMovieItem(), [keep("movie:tmdb:1001")], "protects"],
    ["a Keep on another title is clear", buildMovieItem(), [keep("movie:tmdb:9")], "clear"],
    ["an expired Keep is clear", buildMovieItem(), [keep("movie:tmdb:1001", new Date(NOW - 1))], "clear"],
    ["a Keep that ends now is clear", buildMovieItem(), [keep("movie:tmdb:1001", new Date(NOW))], "clear"],
    ["a show Keep protects a season", season(2), [keep("show:tvdb:2002")], "protects"],
    ["a season Keep protects the show", show, [keep("season:tvdb:2002:2")], "protects"],
    ["a season Keep does not protect another season", season(3), [keep("season:tvdb:2002:2")], "clear"],
  ])("%s", (_name, item, keeps, expected) => {
    expect(verdict("g1", item, live({ keeps, members }))).toBe(expected)
  })

  it("protects with member Keeps turned off: the option stops new Keeps only", () => {
    const ctx = context({ live: buildLiveFacts({ keeps: [keep("movie:tmdb:1001")] }) }, { members: { keepsEnabled: false } })
    expect(verdict("g1", buildMovieItem(), ctx)).toBe("protects")
  })

  it("is never unknown and never inert", () => {
    const ctx = context({ sources: sources({ plex: "notConfigured", tautulli: "failed", overseerr: "failed", radarr: "failed", sonarr: "failed" }) })
    expect(verdict("g1", buildMovieItem(), { ...ctx, live: buildLiveFacts({ keeps: [keep("movie:tmdb:1001")] }) })).toBe("protects")
    expect(verdict("g1", buildMovieItem(), ctx)).toBe("clear")
  })

  it("names the member and the latest end on admin surfaces", () => {
    const keeps = [keep("movie:tmdb:1001", new Date("2026-12-01T12:00:00Z")), keep("movie:tmdb:1001", new Date("2027-01-31T12:00:00Z"))]
    expect(factOf("g1", buildMovieItem(), live({ keeps, members }))).toBe("Kept by Avery Example until Jan 31, 2027.")
    expect(factOf("g1", buildMovieItem(), live({ keeps: [keep("movie:tmdb:1001", new Date(NOW + DAY), "u-gone")] }))).toMatch(/^Kept by Unknown member until /)
    expect(factOf("g1", buildMovieItem(), live({}))).toBe("No member Keep.")
  })
})

describe("G2 Keep forever marks", () => {
  const seasonOwnCopy = season(2, { copies: [{ ratingKey: "7002", sectionId: "2" }] })
  it.each<[string, SnapshotItem, string[], boolean, ProtectionState]>([
    ["a mark on a movie copy protects", buildMovieItem({ copies: [{ ratingKey: "5001", sectionId: "1" }, { ratingKey: "5002", sectionId: "3" }] }), ["5002"], false,
      "protects"],
    ["no mark is clear", buildMovieItem(), ["9999"], false, "clear"],
    ["a mark on an episode protects the show", show, ["6201"], false, "protects"],
    ["a mark on a show copy protects the show", show, ["6001"], false, "protects"],
    ["a mark on an episode protects its season", seasonOwnCopy, [seasonOwnCopy.episodeKeys[0]], false, "protects"],
    ["a mark on the show protects its season", seasonOwnCopy, ["6001"], true, "protects"],
    ["a mark on the show needs the show item", seasonOwnCopy, ["6001"], false, "clear"],
    ["a mark on another season's episode is clear", seasonOwnCopy, ["6301"], true, "clear"],
  ])("%s", (_name, item, marks, withShowItem, expected) => {
    const facts = { live: buildLiveFacts({ keepForever: new Set(marks) }) }
    expect(verdict("g2", item, withShowItem ? withShow(facts) : context(facts))).toBe(expected)
  })

  it("is off with its option, and states the mark", () => {
    const facts = { live: buildLiveFacts({ keepForever: new Set(["5001"]) }) }
    expect(verdict("g2", buildMovieItem(), context(facts, { protections: { g2: { enabled: false } } }))).toBe("clear")
    expect(factOf("g2", buildMovieItem(), context(facts))).toBe("Marked Keep forever by a member.")
    expect(factOf("g2", buildMovieItem(), context())).toBe("No Keep forever mark.")
  })
})

describe("G3 admin exclusions", () => {
  const exclude = (itemKey: string, expiresAt: Date | null) => ({ id: `x-${itemKey}`, itemKey, expiresAt, createdBy: "u-admin" })
  it.each<[string, SnapshotItem, LiveFacts["excludes"], ProtectionState]>([
    ["an exclusion with no end protects", buildMovieItem(), [exclude("movie:tmdb:1001", null)], "protects"],
    ["an exclusion until a later date protects", buildMovieItem(), [exclude("movie:tmdb:1001", new Date(NOW + DAY))], "protects"],
    ["an ended exclusion is clear", buildMovieItem(), [exclude("movie:tmdb:1001", new Date(NOW - DAY))], "clear"],
    ["a show exclusion protects a season", season(1), [exclude("show:tvdb:2002", null)], "protects"],
    ["a season exclusion protects the show", show, [exclude("season:tvdb:2002:3", null)], "protects"],
    ["no exclusion is clear", show, [], "clear"],
  ])("%s", (_name, item, excludes, expected) => {
    expect(verdict("g3", item, live({ excludes }))).toBe(expected)
  })

  it("states the exclusion and its end", () => {
    expect(factOf("g3", buildMovieItem(), live({ excludes: [exclude("movie:tmdb:1001", new Date("2027-03-01T12:00:00Z"))] }))).toBe(
      "Excluded by an admin until Mar 1, 2027.",
    )
    expect(factOf("g3", buildMovieItem(), live({ excludes: [exclude("movie:tmdb:1001", new Date(NOW + DAY)), exclude("movie:tmdb:1001", null)] }))).toBe(
      "Excluded by an admin.",
    )
    expect(factOf("g3", buildMovieItem(), live({}))).toBe("Not excluded.")
  })
})

describe("G4 played in the last N days", () => {
  const movie = (at: number | null) => buildMovieItem({ plays: { lastCountedAt: at, countedAt: at === null ? [] : [at], viewers: [] } })
  it.each<[string, SnapshotItem, EvalContext, ProtectionVerdict]>([
    ["a recent play protects", movie(daysAgo(10)), context(), { verdict: "protects" }],
    ["an old play is clear", movie(daysAgo(40)), context(), { verdict: "clear" }],
    ["no play is clear", movie(null), context(), { verdict: "clear" }],
    ["the option days count", movie(daysAgo(40)), context({}, { protections: { g4: { days: 60 } } }), { verdict: "protects" }],
    ["exactly N days ago protects", movie(NOW_S - 30 * 86_400), context(), { verdict: "protects" }],
    ["N days and 1 ms ago is clear", movie(NOW_S - 30 * 86_400), context({ now: NOW + 1 }), { verdict: "clear" }],
    ["unknown plays are unknown", buildMovieItem({ plays: null }), context(), { verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } }],
    ["a failed Tautulli is unknown", movie(null), context({ sources: sources({ tautulli: "failed" }) }), { verdict: "unknown",
      cause: { kind: "sourceFailed", service: "tautulli" } }],
    ["Tautulli not set up is inert", buildMovieItem({ plays: null }), context({ sources: sources({ tautulli: "notConfigured" }) }), { verdict: "clear" }],
  ])("%s", (_name, item, ctx, expected) => {
    expect(evaluateGlobal("g4", item, ctx)).toEqual(expected)
  })

  it("states the last play", () => {
    expect(factOf("g4", movie(Date.parse("2026-11-01T12:00:00Z") / 1000), context())).toBe("Last played Nov 1, 2026.")
    expect(factOf("g4", movie(null), context())).toBe("Never played.")
    expect(factOf("g4", buildMovieItem({ plays: null }), context())).toBe("")
  })
})

describe("G5 part-way through", () => {
  it.each<[string, SnapshotItem, ProtectionState]>([
    ["a movie with an unfinished newest play protects", played(buildMovieItem(), [viewer("100")]), "protects"],
    ["a movie with a finished newest play is clear", played(buildMovieItem(), [viewer("100", { lastCountedFinished: true, finished: true })]), "clear"],
    ["an old unfinished play is clear", played(buildMovieItem(), [viewer("100", { lastCountedAt: daysAgo(200) })]), "clear"],
    ["a viewer with no counted play is clear", played(buildMovieItem(), [viewer("100", { lastCountedAt: null, counted: 0 })]), "clear"],
    ["a show with episodes left protects", played(show, [viewer("100", { finishedEpisodes: 1 })]), "protects"],
    ["a show with every episode finished is clear", played(show, [viewer("100", { finishedEpisodes: 4, finished: true })]), "clear"],
    ["a season with episodes left protects", played(season(1, { episodeCount: 3 }), [viewer("100", { finishedEpisodes: 2 })]), "protects"],
    ["no episode count: the finished flag decides", played(season(1, { episodeCount: null }), [viewer("100", { finished: true })]), "clear"],
    ["no episode count and not finished protects", played(season(1, { episodeCount: null }), [viewer("100")]), "protects"],
  ])("%s", (_name, item, expected) => {
    expect(verdict("g5", item, context())).toBe(expected)
  })

  it("is unknown without plays and inert without Tautulli, and states the result", () => {
    expect(evaluateGlobal("g5", buildMovieItem({ plays: null }), context()).verdict).toBe("unknown")
    expect(verdict("g5", buildMovieItem({ plays: null }), context({ sources: sources({ tautulli: "notConfigured" }) }))).toBe("clear")
    expect(factOf("g5", played(buildMovieItem(), [viewer("100")]), context())).toBe("A member is part-way through it.")
    expect(factOf("g5", played(buildMovieItem(), []), context())).toBe("Nobody is part-way through it.")
    expect(factOf("g5", buildMovieItem({ plays: null }), context())).toBe("")
  })
})

describe("G6 added in the last N days", () => {
  const added = (plex: number | null, arr: number | null, item: SnapshotItem = buildMovieItem()) => ({ ...item, added: { plex, arr } })
  const radarrFailed = context({ sources: sources({ radarr: "failed" }) })
  it.each<[string, SnapshotItem, EvalContext, ProtectionVerdict]>([
    ["a recent Plex date protects", added(daysAgo(5), daysAgo(400)), context(), { verdict: "protects" }],
    ["a recent arr date protects", added(daysAgo(400), daysAgo(5)), context(), { verdict: "protects" }],
    ["a recent episode protects a show", { ...added(daysAgo(400), daysAgo(400), show), show: showFacts({ lastEpisodeAddedAt: daysAgo(3) }) }, context(),
      { verdict: "protects" }],
    ["old dates are clear", added(daysAgo(400), daysAgo(300)), context(), { verdict: "clear" }],
    ["no known date is unknown", added(null, null), context(), { verdict: "unknown", cause: { kind: "noValue", what: "date" } }],
    ["a failed arr with an old Plex date is unknown", added(daysAgo(400), null), radarrFailed, { verdict: "unknown",
      cause: { kind: "sourceFailed", service: "radarr" } }],
    ["a failed arr with a recent Plex date protects", added(daysAgo(5), null), radarrFailed, { verdict: "protects" }],
    ["a failed Sonarr loses a show's episode date", { ...added(daysAgo(400), null, show), show: null }, context({ sources: sources({ sonarr: "failed" }) }),
      { verdict: "unknown", cause: { kind: "sourceFailed", service: "sonarr" } }],
  ])("%s", (_name, item, ctx, expected) => {
    expect(evaluateGlobal("g6", item, ctx)).toEqual(expected)
  })

  it("states the newest date", () => {
    const at = Date.parse("2026-10-20T12:00:00Z") / 1000
    expect(factOf("g6", added(at, daysAgo(400)), context())).toBe("Added Oct 20, 2026.")
    expect(factOf("g6", { ...added(daysAgo(400), daysAgo(400), show), show: showFacts({ lastEpisodeAddedAt: at }) }, context())).toBe(
      "Last episode added Oct 20, 2026.",
    )
    expect(factOf("g6", added(null, null), context())).toBe("Added date unknown.")
  })
})

describe("G7 requested recently by a member with access who has not finished it", () => {
  const asked = (requests: RequestFact[] | null, viewers: Viewer[] | null = []) =>
    buildMovieItem({ requests, plays: viewers === null ? null : { lastCountedAt: null, countedAt: [], viewers } })
  it.each<[string, SnapshotItem, ProtectionVerdict]>([
    ["a member with no viewer row protects", asked([req()]), { verdict: "protects" }],
    ["a member who has not finished protects", asked([req()], [viewer("100")]), { verdict: "protects" }],
    ["a member who finished is clear", asked([req()], [viewer("100", { finished: true })]), { verdict: "clear" }],
    ["a former member is clear", asked([req({ by: "200" })]), { verdict: "clear" }],
    ["an unknown account is clear", asked([req({ by: "999" })]), { verdict: "clear" }],
    ["an old request is clear", asked([req({ at: daysAgo(100) })]), { verdict: "clear" }],
    ["no request is clear", asked([]), { verdict: "clear" }],
    ["a requester with no Plex id is unknown", asked([req({ by: null })]), { verdict: "unknown", cause: { kind: "noValue", what: "requester" } }],
    ["a requester with unknown access is unknown", asked([req({ by: "300" })]), { verdict: "unknown", cause: { kind: "noValue", what: "access" } }],
    ["unknown plays with a qualifying request are unknown", asked([req()], null), { verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } }],
    ["unknown plays with only a former requester are clear", asked([req({ by: "200" })], null), { verdict: "clear" }],
    ["a sure request beats an unknown one", asked([req({ by: null }), req()]), { verdict: "protects" }],
    ["unknown requests are unknown", asked(null), { verdict: "unknown", cause: { kind: "sourceFailed", service: "overseerr" } }],
  ])("%s", (_name, item, expected) => {
    expect(evaluateGlobal("g7", item, context())).toEqual(expected)
  })

  it("reads the requests of the season only, is inert without Overseerr, and follows the option days", () => {
    const seasonItem = season(2, { requests: [req({ seasons: [1] })], plays: { lastCountedAt: null, countedAt: [], viewers: [] } })
    expect(verdict("g7", seasonItem, context())).toBe("clear")
    expect(verdict("g7", { ...seasonItem, requests: [req({ seasons: [2] })] }, context())).toBe("protects")
    expect(verdict("g7", asked(null), context({ sources: sources({ overseerr: "notConfigured" }) }))).toBe("clear")
    expect(verdict("g7", asked(null), context({ sources: sources({ overseerr: "failed" }) }))).toBe("unknown")
    expect(verdict("g7", asked([req({ at: daysAgo(100) })]), context({}, { protections: { g7: { days: 120 } } }))).toBe("protects")
  })

  it("states the open request", () => {
    const at = Date.parse("2026-11-02T12:00:00Z") / 1000
    expect(factOf("g7", asked([req({ at }), req({ by: "200", at: daysAgo(1) })]), context())).toBe("Requested Nov 2, 2026 by a member who has not finished it.")
    expect(factOf("g7", asked([]), context())).toBe("No request in the last 90 days by a member who has not finished it.")
    expect(factOf("g7", asked(null), context())).toBe("")
  })
})

describe("G8 on a watchlist", () => {
  const watchlist = (ids: { tmdb?: number[]; tvdb?: number[]; imdb?: string[] }) =>
    buildLiveFacts({ watchlist: { tmdb: new Set(ids.tmdb ?? []), tvdb: new Set(ids.tvdb ?? []), imdb: new Set(ids.imdb ?? []) } })
  it.each<[string, SnapshotItem, EvalContext, ProtectionVerdict]>([
    ["a movie TMDB id protects", buildMovieItem(), context({ live: watchlist({ tmdb: [1001] }) }), { verdict: "protects" }],
    ["a movie IMDb id protects", buildMovieItem(), context({ live: watchlist({ imdb: ["tt0000001"] }) }), { verdict: "protects" }],
    ["a show TVDB id protects", show, context({ live: watchlist({ tvdb: [2002] }) }), { verdict: "protects" }],
    ["a season reads its show's ids", season(1, { ids: {} }), withShow({ live: watchlist({ tvdb: [2002] }) }), { verdict: "protects" }],
    ["no id on the list is clear", buildMovieItem(), context({ live: watchlist({ tmdb: [5] }) }), { verdict: "clear" }],
    ["a failed share list is unknown", buildMovieItem(), context({ shares: "failed" }), { verdict: "unknown", cause: { kind: "noValue", what: "access" } }],
    ["a failed share list still protects a listed title", buildMovieItem(), context({ shares: "failed", live: watchlist({ tmdb: [1001] }) }),
      { verdict: "protects" }],
    ["Plex not set up is inert", buildMovieItem(), context({ shares: "failed", sources: sources({ plex: "notConfigured" }) }), { verdict: "clear" }],
  ])("%s", (_name, item, ctx, expected) => {
    expect(evaluateGlobal("g8", item, ctx)).toEqual(expected)
  })

  it("states the watchlist", () => {
    expect(factOf("g8", buildMovieItem(), context({ live: watchlist({ tmdb: [1001] }) }))).toBe("On the watchlist of a member with access.")
    expect(factOf("g8", buildMovieItem(), context())).toBe("Not on a known watchlist.")
  })
})

describe("G9 arr tag", () => {
  const tagged = (item: SnapshotItem, tags: string[]): SnapshotItem => ({ ...item, arr: item.arr && { ...item.arr, tags } })
  it.each<[string, SnapshotItem, EvalContext, ProtectionVerdict]>([
    ["a keep tag protects", tagged(buildMovieItem(), ["keep"]), context(), { verdict: "protects" }],
    ["tags compare in lower case", tagged(buildMovieItem(), ["archive"]), context({}, { protections: { g9: { tags: [" Archive"] } } }), { verdict: "protects" }],
    ["another tag is clear", tagged(buildMovieItem(), ["4k"]), context(), { verdict: "clear" }],
    ["no arr record is clear", buildMovieItem({ arr: null }), context(), { verdict: "clear" }],
    ["a failed Radarr is unknown", buildMovieItem({ arr: null }), context({ sources: sources({ radarr: "failed" }) }), { verdict: "unknown",
      cause: { kind: "sourceFailed", service: "radarr" } }],
    ["Radarr not set up is inert", buildMovieItem({ arr: null }), context({ sources: sources({ radarr: "notConfigured" }) }), { verdict: "clear" }],
    ["a season reads its show's tags", tagged(season(1), []), context({ showsByKey: new Map([[show.key, tagged(show, ["keep"])]]) }), { verdict: "protects" }],
    ["a season of a failed Sonarr is unknown", season(1, { arr: null }), context({ sources: sources({ sonarr: "failed" }) }), { verdict: "unknown",
      cause: { kind: "sourceFailed", service: "sonarr" } }],
  ])("%s", (_name, item, ctx, expected) => {
    expect(evaluateGlobal("g9", item, ctx)).toEqual(expected)
  })

  it("states the tag", () => {
    expect(factOf("g9", tagged(buildMovieItem(), ["Keep"]), context())).toBe("Has the Radarr tag Keep.")
    expect(factOf("g9", tagged(show, []), context())).toBe("No Sonarr tag matches.")
  })
})

describe("G10 stored Rewind", () => {
  const rewind = (keys: string[] | null) => buildLiveFacts({ rewindKeys: keys === null ? null : new Set(keys) })
  it.each<[string, SnapshotItem, EvalContext, ProtectionState]>([
    ["a movie copy in a stored Rewind protects", buildMovieItem(), context({ live: rewind(["5001"]) }), "protects"],
    ["a title in no stored Rewind is clear", buildMovieItem(), context({ live: rewind(["9"]) }), "clear"],
    ["a season of a show in a stored Rewind protects", season(1, { copies: [{ ratingKey: "7001", sectionId: "2" }] }), withShow({ live: rewind(["6001"]) }),
      "protects"],
    ["after the season closes it is clear", buildMovieItem(), context({ live: rewind(null) }), "clear"],
  ])("%s", (_name, item, ctx, expected) => {
    expect(verdict("g10", item, ctx)).toBe(expected)
  })

  it("states the Rewind", () => {
    expect(factOf("g10", buildMovieItem(), context({ live: rewind(["5001"]) }))).toBe("In a stored Rewind.")
    expect(factOf("g10", buildMovieItem(), context({ live: rewind([]) }))).toBe("Not in a stored Rewind.")
    expect(factOf("g10", buildMovieItem(), context({ live: rewind(null) }))).toBe("The Rewind season is closed.")
  })
})

describe("G11 newest season of a continuing show", () => {
  const newestSeason = (status: ShowFacts["status"], n = 3) => season(n, { show: showFacts({ status }) })
  it.each<[string, SnapshotItem, EvalContext, ProtectionVerdict]>([
    ["continuing: the newest season protects", newestSeason("continuing"), context(), { verdict: "protects" }],
    ["upcoming: the newest season protects", newestSeason("upcoming"), context(), { verdict: "protects" }],
    ["ended: the newest season is clear", newestSeason("ended"), context(), { verdict: "clear" }],
    ["deleted: the newest season is clear", newestSeason("deleted"), context(), { verdict: "clear" }],
    ["continuing: an older season is clear", newestSeason("continuing", 2), context(), { verdict: "clear" }],
    ["no season number is clear", season(3, { seasonNumber: null, show: newestSeason("continuing").show }), context(), { verdict: "clear" }],
    ["no status and Sonarr ok is clear", newestSeason(null), context(), { verdict: "clear" }],
    ["a failed Sonarr is unknown", season(3, { show: null }), context({ sources: sources({ sonarr: "failed" }) }), { verdict: "unknown",
      cause: { kind: "sourceFailed", service: "sonarr" } }],
    ["Sonarr not set up is inert", season(3, { show: null }), context({ sources: sources({ sonarr: "notConfigured" }) }), { verdict: "clear" }],
  ])("%s", (_name, item, ctx, expected) => {
    expect(evaluateGlobal("g11", item, ctx)).toEqual(expected)
  })

  it("applies to seasons only, and states the result", () => {
    expect(globalProtections("show", buildOptions()).some((g) => g.id === "g11")).toBe(false)
    expect(factOf("g11", newestSeason("continuing"), context())).toBe("The newest season of a continuing show.")
    expect(factOf("g11", newestSeason("ended"), context())).toBe("Not the newest season of a continuing show.")
    expect(factOf("g11", season(3, { show: null }), context())).toBe("")
  })
})

describe("G12 a recent viewer of the show has not finished the season", () => {
  const showPlayed = (at: number | null) => played(show, [viewer("100", { lastCountedAt: at })])
  const ctxFor = (s: SnapshotItem, overrides: Partial<EvalContext> = {}, options: OptionsInput = {}) =>
    context({ showsByKey: new Map([[s.key, s]]), ...overrides }, options)
  const seasonWith = (rows: Viewer[], overrides: Partial<SnapshotItem> = {}) => played(season(2, { episodeCount: 5, ...overrides }), rows)

  it.each<[string, SnapshotItem, EvalContext, ProtectionVerdict]>([
    ["a viewer ahead: the season is still to watch", seasonWith([]), ctxFor(showPlayed(daysAgo(10))), { verdict: "protects" }],
    ["a viewer part-way through the season", seasonWith([viewer("100", { finishedEpisodes: 2 })]), ctxFor(showPlayed(daysAgo(10))), { verdict: "protects" }],
    ["a viewer done with the season", seasonWith([viewer("100", { finishedEpisodes: 5, finished: true })]), ctxFor(showPlayed(daysAgo(10))), { verdict: "clear" }],
    ["an old viewer of the show", seasonWith([]), ctxFor(showPlayed(daysAgo(400))), { verdict: "clear" }],
    ["the option days count", seasonWith([]), ctxFor(showPlayed(daysAgo(400)), {}, { protections: { g12: { days: 500 } } }), { verdict: "protects" }],
    ["no viewer of the show", seasonWith([]), ctxFor(played(show, [])), { verdict: "clear" }],
    ["no episode count: the finished flag decides", seasonWith([viewer("100", { finished: true })], { episodeCount: null }), ctxFor(showPlayed(daysAgo(10))),
      { verdict: "clear" }],
    ["unknown show plays", seasonWith([]), ctxFor({ ...show, plays: null }), { verdict: "unknown", cause: { kind: "sourceFailed", service: "tautulli" } }],
    ["unknown season plays", season(2, { plays: null }), ctxFor(showPlayed(daysAgo(10))), { verdict: "unknown",
      cause: { kind: "sourceFailed", service: "tautulli" } }],
    ["no show item", seasonWith([]), context(), { verdict: "unknown" }],
    ["Tautulli not set up is inert", seasonWith([]), ctxFor(showPlayed(daysAgo(10)), { sources: sources({ tautulli: "notConfigured" }) }), { verdict: "clear" }],
  ])("%s", (_name, item, ctx, expected) => {
    expect(evaluateGlobal("g12", item, ctx)).toEqual(expected)
  })

  it("states the result", () => {
    expect(factOf("g12", seasonWith([]), ctxFor(showPlayed(daysAgo(10))))).toBe("A member who played the show recently has not finished this season.")
    expect(factOf("g12", seasonWith([]), ctxFor(showPlayed(daysAgo(400))))).toBe("Every member who played the show in the last 365 days finished this season.")
    expect(factOf("g12", seasonWith([]), context())).toBe("")
  })
})

describe("G13 Plex collection", () => {
  const on = { protections: { g13: { enabled: true, collections: ["Christmas", "Halloween"] } } }
  const inCollection = (item: SnapshotItem, collections: string[]): SnapshotItem => ({ ...item, collections })
  it.each<[string, SnapshotItem, EvalContext, ProtectionState]>([
    ["a title in a named collection protects", inCollection(buildMovieItem(), ["christmas"]), context({}, on, []), "protects"],
    ["a title in no named collection is clear once both were read", inCollection(buildMovieItem(), ["Other"]), context({}, on, ["Christmas", "halloween"]), "clear"],
    ["a name that was not read yet is unknown", buildMovieItem(), context({}, on, ["Christmas"]), "unknown"],
    ["a season reads its show's collections", season(1), context({ showsByKey: new Map([[show.key, inCollection(show, ["Halloween"])]]) }, on, []), "protects"],
    ["no names is clear", buildMovieItem(), context({}, { protections: { g13: { enabled: true, collections: [] } } }), "clear"],
    ["Plex not set up is inert", buildMovieItem(), context({ sources: sources({ plex: "notConfigured" }) }, on, []), "clear"],
    ["off by default", inCollection(buildMovieItem(), ["Christmas"]), context(), "clear"],
  ])("%s", (_name, item, ctx, expected) => {
    expect(verdict("g13", item, ctx)).toBe(expected)
  })

  it("states the collection", () => {
    expect(factOf("g13", inCollection(buildMovieItem(), ["CHRISTMAS"]), context({}, on))).toBe("In the Plex collection Christmas.")
    expect(factOf("g13", buildMovieItem(), context({}, on))).toBe("In none of the chosen Plex collections.")
  })
})
