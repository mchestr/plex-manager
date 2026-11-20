/**
 * Test builders for media cleanup: snapshot items and facts, conditions,
 * definitions, options, live facts, stored documents and an `EvalContext`
 * with stub evaluators (deviation D1). Every value is invented. Each builder
 * takes overrides, so a test states only what it is about.
 *
 * @internal Test-only.
 * @module lib/cleanup/__tests__/helpers/builders
 */

import type { z } from "zod"

import type { Block } from "@/lib/cleanup/blocks"
import type {
  EvalContext,
  FieldEval,
  FieldEvals,
  FieldVerdict,
  GlobalProtectionEval,
  GlobalProtectionId,
  LiveFacts,
  ProtectionState,
  ProtectionVerdict,
  Verdict,
} from "@/lib/cleanup/engine/types"
import type { CleanupRuntime, RestoreItem } from "@/lib/cleanup/schema/runtime"
import type { SnapshotFacts, SnapshotItem, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { RuleStats } from "@/lib/cleanup/schema/stats"
import type { WhySnapshot } from "@/lib/cleanup/schema/why"
import { type CleanupOptions, cleanupOptionsSchema, parseCleanupOptions } from "@/lib/validations/cleanup-options"
import type { ConditionOf, RuleDefinition } from "@/lib/validations/cleanup-rule"
import { FIELD_IDS, type FieldId, GiB, LEVELS, type Level, SERVICES } from "@/lib/validations/cleanup-vocabulary"

/** @internal The fixed clock of the builders: 2026-11-08 12:00 UTC. */
export const NOW = Date.parse("2026-11-08T12:00:00.000Z")
/** @internal `NOW` in Unix seconds, as the snapshot stores times. */
export const NOW_S = Math.floor(NOW / 1000)
/** @internal Unix seconds `days` before `NOW`. */
export const daysAgo = (days: number) => NOW_S - Math.round(days * 86_400)

/** @internal The shared `keysHash` vector (TS 10.3): SHA-256 of "movie:tmdb:1\nmovie:tmdb:2". Any key order gives it. */
export const KEYS_HASH_VECTOR = {
  keys: ["movie:tmdb:2", "movie:tmdb:1"],
  hash: "65c6a0dd711b9b07fef5573c02806eb6f6d3e5f756a58609b27d615a5736a861",
} as const

/** @internal A matched movie with plays, no request and a Radarr record. */
export function buildMovieItem(overrides: Partial<SnapshotItem> = {}): SnapshotItem {
  const tmdb = 1001
  return {
    key: `movie:tmdb:${tmdb}`,
    level: "movie",
    titleKey: `tmdb:${tmdb}`,
    title: "The Invented Movie",
    year: 2019,
    seasonNumber: null,
    showKey: null,
    sectionId: "1",
    ratingKey: "5001",
    copies: [{ ratingKey: "5001", sectionId: "1" }],
    episodeKeys: [],
    ids: { tmdb, imdb: "tt0000001" },
    added: { plex: daysAgo(400), arr: daysAgo(401) },
    sizeBytes: 12 * GiB,
    episodeCount: null,
    match: { state: "matched", by: "tmdb" },
    arr: { service: "radarr", id: 11, titleSlug: "the-invented-movie-1001", path: "/media/movies/The Invented Movie (2019)",
      root: "/media/movies", tags: [], importList: false, monitored: true, fileId: 77 },
    show: null,
    position: null,
    plays: { lastCountedAt: daysAgo(200), countedAt: [daysAgo(200)], viewers: [
      { user: "100", lastCountedAt: daysAgo(200), lastCountedFinished: true, counted: 1, finished: true, finishedEpisodes: 0 },
    ] },
    requests: [],
    collections: [],
    labels: [],
    ...overrides,
  }
}

/** @internal A matched, ended show with three seasons on disk. */
export function buildShowItem(overrides: Partial<SnapshotItem> = {}): SnapshotItem {
  const tvdb = 2002
  return {
    ...buildMovieItem(),
    key: `show:tvdb:${tvdb}`,
    level: "show",
    titleKey: `tvdb:${tvdb}`,
    title: "An Invented Show",
    year: 2015,
    sectionId: "2",
    ratingKey: "6001",
    copies: [{ ratingKey: "6001", sectionId: "2" }],
    episodeKeys: ["6101", "6102", "6201", "6301"],
    ids: { tvdb, tmdb: 3003 },
    sizeBytes: 80 * GiB,
    episodeCount: 4,
    match: { state: "matched", by: "tvdb" },
    arr: { service: "sonarr", id: 22, titleSlug: "an-invented-show", path: "/media/tv/An Invented Show", root: "/media/tv",
      tags: [], importList: false, monitored: true, fileCount: 4 },
    show: { status: "ended", seasonsOnDisk: 3, newestSeasonOnDisk: 3, lastEpisodeAddedAt: daysAgo(500) },
    plays: { lastCountedAt: daysAgo(300), countedAt: [daysAgo(300)], viewers: [
      { user: "100", lastCountedAt: daysAgo(300), lastCountedFinished: true, counted: 1, finished: false, finishedEpisodes: 1 },
    ] },
    ...overrides,
  }
}

/** @internal Season `seasonNumber` of `show` (1 is the oldest; `position` 1 is the newest on disk). */
export function buildSeasonItem(show: SnapshotItem = buildShowItem(), seasonNumber = 1, overrides: Partial<SnapshotItem> = {}): SnapshotItem {
  const seasons = show.show?.seasonsOnDisk ?? 1
  return {
    ...show,
    key: `season:${show.titleKey}:${seasonNumber}`,
    level: "season",
    seasonNumber,
    showKey: show.key,
    episodeKeys: [`${show.ratingKey}${seasonNumber}1`],
    sizeBytes: 20 * GiB,
    episodeCount: 1,
    arr: show.arr ? { ...show.arr, fileCount: 1 } : null,
    position: Math.max(1, seasons - seasonNumber + 1),
    labels: [],
    ...overrides,
  }
}

/** @internal Every service `ok`, read at `NOW`, with row counts for the shrink check. */
export function buildSourceStatuses(overrides: Partial<Record<(typeof SERVICES)[number], Partial<SourceStatus>>> = {}): SourceStatus[] {
  const readAt = new Date(NOW).toISOString()
  return SERVICES.map((service) => ({ service, state: "ok", readAt, rows: 100, ...overrides[service] }))
}

/** @internal The facts of one complete read: two libraries with Radarr and Sonarr, a history of three years. */
export function buildSnapshotFacts(overrides: Partial<SnapshotFacts> = {}): SnapshotFacts {
  return {
    version: 1,
    takenAt: new Date(NOW).toISOString(),
    history: { startAt: daysAgo(3 * 365), newestAt: daysAgo(1), rows: 5000, orphans: 0, usersWithPlay: 12 },
    users: { "100": { hasAccess: true, lastPlayAt: daysAgo(1), owner: false }, "1": { hasAccess: true, lastPlayAt: daysAgo(2), owner: true } },
    libraries: [
      { sectionId: "1", title: "Movies", type: "movie", agent: "tv.plex.agents.movie", locations: ["/media/movies"], arr: "radarr",
        noIds: false, items: 780, seasons: 0, bytes: 9 * 1024 * GiB },
      { sectionId: "2", title: "TV Shows", type: "show", agent: "tv.plex.agents.series", locations: ["/media/tv"], arr: "sonarr",
        noIds: false, items: 636, seasons: 2000, bytes: 40 * 1024 * GiB },
    ],
    disk: { freeBytes: 25 * 1024 * GiB, totalBytes: 84 * 1024 * GiB },
    growthBytesPerMonth: 1400 * GiB,
    collections: [],
    membersRead: [],
    importListCount: { radarr: 0, sonarr: 0 },
    machineIdentifier: "invented-machine-id",
    labelsRead: ["1", "2"],
    rowBaseline: { overseerrRequests: 300, tautulliRows: 5000, usersWithPlay: 12 },
    ...overrides,
  }
}

const CONDITION_DEFAULTS: { [F in FieldId]: ConditionOf<F> } = {
  "watch.lastPlayed": { id: "c1", field: "watch.lastPlayed", op: "moreThan", value: { duration: { amount: 365, unit: "days" }, orNever: true } },
  "watch.plays": { id: "c1", field: "watch.plays", op: "fewerThan", value: { count: 1, window: { kind: "total" } } },
  "request.exists": { id: "c1", field: "request.exists", op: "is", value: { exists: false } },
  "request.age": { id: "c1", field: "request.age", op: "moreThan", value: { duration: { amount: 120, unit: "days" } } },
  "request.by": { id: "c1", field: "request.by", op: "only", value: { requesters: [{ kind: "former" }] } },
  "request.requesters": { id: "c1", field: "request.requesters", op: "is", value: { did: "neverPlayed" } },
  "library.added": { id: "c1", field: "library.added", op: "moreThan", value: { duration: { amount: 90, unit: "days" } } },
  "file.size": { id: "c1", field: "file.size", op: "moreThan", value: { bytes: 20 * GiB, unit: "GB" } },
  "show.status": { id: "c1", field: "show.status", op: "is", value: { status: "ended" } },
  "show.lastEpisodeAdded": { id: "c1", field: "show.lastEpisodeAdded", op: "moreThan", value: { duration: { amount: 365, unit: "days" } } },
  "show.seasonsOnDisk": { id: "c1", field: "show.seasonsOnDisk", op: "atLeast", value: { count: 3 } },
  "season.position": { id: "c1", field: "season.position", op: "notNewest", value: { count: 2 } },
}

/** @internal A valid condition of `field`: the "default for a new row" of TS 4.2, id `c1`. */
export function buildCondition<F extends FieldId>(field: F, overrides: Partial<ConditionOf<F>> = {}): ConditionOf<F> {
  return { ...CONDITION_DEFAULTS[field], ...overrides }
}

/** @internal A valid movie rule: one condition (never played in a year), 30 days, delete with the exclusion. */
export function buildDefinition(overrides: Partial<RuleDefinition> = {}): RuleDefinition {
  return {
    schemaVersion: 1,
    level: "movie",
    libraries: ["1"],
    conditions: [buildCondition("watch.lastPlayed")],
    protections: [],
    then: { graceDays: 30, action: "movie.delete", importListExclusion: true },
    ...overrides,
  }
}

/** @internal Options with defaults; each given section fills its own missing keys with defaults. */
export function buildOptions(overrides: z.input<typeof cleanupOptionsSchema> = {}): CleanupOptions {
  return parseCleanupOptions(overrides)
}

/** @internal No Keep, exclusion, mark or watchlist; the Rewind season is closed. */
export function buildLiveFacts(overrides: Partial<LiveFacts> = {}): LiveFacts {
  return {
    keeps: [],
    excludes: [],
    keepForever: new Set(),
    watchlist: { tmdb: new Set(), tvdb: new Set(), imdb: new Set() },
    rewindKeys: null,
    members: [],
    ...overrides,
  }
}

/** @internal Per item key, then per condition id: the verdict a stub field gives. */
export type VerdictTable = Record<string, Record<string, Verdict | FieldVerdict>>

/** @internal A `FieldEval` that reads its verdict from `table` by item key and condition id, else `fallback`. */
export function stubFieldEval<F extends FieldId>(id: F, table: VerdictTable = {}, fallback: Verdict = "pass"): FieldEval<F> {
  return {
    id,
    evaluate: (item, c) => {
      const entry = table[item.key]?.[c.id] ?? fallback
      return typeof entry === "string" ? { verdict: entry } : entry
    },
    gap: () => null,
    forecast: () => null,
    tryValue: () => null,
    measure: () => null,
    fact: () => [{ text: `${id} fact.` }],
  }
}

/** @internal Stub evaluators for every field: `table` lookups, else `fallback`. `overrides` replaces single fields. */
export function stubEvals(table: VerdictTable = {}, fallback: Verdict = "pass", overrides: Partial<FieldEvals> = {}): FieldEvals {
  const evals = Object.fromEntries(FIELD_IDS.map((id) => [id, overrides[id] ?? stubFieldEval(id, table, fallback)]))
  return evals as FieldEvals
}

/** @internal A global protection that reads its state from `table` by item key, else `fallback`. */
export function stubGlobal(
  id: GlobalProtectionId,
  table: Record<string, ProtectionState | ProtectionVerdict> = {},
  fallback: ProtectionState = "clear",
  levels: readonly Level[] = LEVELS,
): GlobalProtectionEval {
  return {
    id,
    levels,
    needs: [],
    evaluate: (item) => {
      const entry = table[item.key] ?? fallback
      return typeof entry === "string" ? { verdict: entry } : entry
    },
    fact: () => [{ text: `${id} fact.` }],
  }
}

/** @internal An `EvalContext` at `NOW` in UTC: every source ok, stub fields that pass, no global protection. */
export function buildEvalContext(overrides: Partial<EvalContext> = {}): EvalContext {
  return {
    now: NOW,
    today: "2026-11-08",
    zone: "UTC",
    sources: { plex: "ok", tautulli: "ok", overseerr: "ok", radarr: "ok", sonarr: "ok" },
    shares: "ok",
    history: { startAt: daysAgo(3 * 365), newestAt: daysAgo(1) },
    users: new Map(),
    memberPlexIds: new Map(),
    showsByKey: new Map(),
    live: buildLiveFacts(),
    options: buildOptions(),
    evals: stubEvals(),
    globals: globalsOf([]),
    ...overrides,
  }
}

/** @internal The global protections of a context: those of `list` that apply to the level. */
export function globalsOf(list: readonly GlobalProtectionEval[]): EvalContext["globals"] {
  return (level) => list.filter((g) => g.levels.includes(level))
}

/** @internal A stored Why of a match of rule `rule-1`. */
export function buildWhySnapshot(overrides: Partial<WhySnapshot> = {}): WhySnapshot {
  const at = new Date(NOW).toISOString()
  return {
    v: 1, snapshotId: "snap-1", takenAt: at, checkedAt: at, ruleId: "rule-1",
    conditions: [{ id: "c1", field: "watch.lastPlayed", verdict: "pass" }],
    protections: [{ id: "g4", verdict: "clear" }],
    facts: { lastCountedAt: daysAgo(400), countedTotal: 1, addedPlex: daysAgo(500), addedArr: daysAgo(501), sizeBytes: 12 * GiB,
      requests: [{ at: daysAgo(600), requester: "former" }], importList: false, showStatus: null, seasonsOnDisk: null, position: null,
      lastEpisodeAddedAt: null, historyStartAt: daysAgo(3 * 365) },
    match: { state: "matched", by: "tmdb", externalId: "1001", service: "radarr", arrId: 11, path: "/media/movies/The Invented Movie (2019)" },
    sources: buildSourceStatuses(),
    ...overrides,
  }
}

/** @internal A safety stop that a stored run or evaluation holds. */
export function buildBlock(overrides: Partial<Block> = {}): Block {
  return { code: "sourceFailed", service: "tautulli", readAt: new Date(NOW).toISOString(), ...overrides }
}

/** @internal Stored rule stats: one evaluation and two dry runs of one definition. */
export function buildRuleStats(overrides: Partial<RuleStats> = {}): RuleStats {
  const at = (days: number) => new Date(NOW - days * 86_400_000).toISOString()
  return {
    v: 1,
    lastEval: { runId: "run-1", at: at(0), snapshotId: "snap-1", checked: 780, matches: 197, bytes: 1300 * GiB, nearMisses: 12,
      protected: 17, missing: 4, cannotDelete: 2, largest: ["5001"], overlaps: [], blocks: [] },
    dryRuns: [
      { at: at(2), runId: "run-0", snapshotId: "snap-0", matches: 191, bytes: 1250 * GiB, definitionHash: "0123456789abcdef" },
      { at: at(1), runId: "run-1", snapshotId: "snap-1", matches: 197, bytes: 1300 * GiB, definitionHash: "0123456789abcdef" },
    ],
    ...overrides,
  }
}

/** @internal A runtime with one Plex collection and no notice. */
export function buildRuntime(overrides: Partial<CleanupRuntime> = {}): CleanupRuntime {
  const at = new Date(NOW).toISOString()
  return {
    collections: { "1:movie": { ratingKey: "9001", title: "Movies leaving soon", createdAt: at, lastSyncAt: at, count: 3,
      hub: { ownHome: true, sharedHome: true, recommended: false } } },
    lastSync: { at, ok: true },
    notices: [],
    ...overrides,
  }
}

/** @internal The state of an item that a Keep took out, for Undo. */
export function buildRestoreItem(overrides: Partial<RestoreItem> = {}): RestoreItem {
  const at = new Date(NOW).toISOString()
  return { ruleIds: ["rule-1"], action: "movie.delete", importListExclusion: true, needsApproval: false, enteredAt: at,
    leaveOn: "2026-12-08", firstLeaveOn: "2026-12-08", state: "leaving", approvedAt: null, approvedBy: null, keptAt: at, ...overrides }
}
