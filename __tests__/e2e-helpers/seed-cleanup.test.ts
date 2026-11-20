/**
 * @jest-environment node
 */

/**
 * The E2E cleanup data (TS 16.4 data rules, delivery-r2-2, delivery-r4-1):
 * `buildCleanupWorld(now)` of `e2e/helpers/cleanup-fixtures.ts` makes the
 * mock answers and the seeded snapshot, and `cleanupSeedRows()` and its two
 * siblings make the rows that `e2e/helpers/seed-cleanup.ts` writes.
 *
 * At two clocks, today and 30 days later, the data must pass the safety
 * stops of TS 8.2 by the constants, and the seeded counts must equal what a
 * read of the mocks counts. Every stored document must parse with the
 * `w1-contracts` schemas, every mock answer with the `w1-conn-read`
 * projections, and every seeded id with the action input schemas. The
 * `ruleBlocks()` check with the real engine is wave 3's
 * (`seed-cleanup-blocks.test.ts`, plan D17).
 */

import type { PlaywrightTestConfig } from "@playwright/test"
import { z } from "zod"

import { BLOCK_CODES } from "@/lib/cleanup/blocks"
import { NEVER_WINDOW_DAYS, STALE_DATA_HOURS, TAUTULLI_STALE_DAYS } from "@/lib/cleanup/constants"
import { outcomeDetailSchema } from "@/lib/cleanup/outcomes"
import { arrRefSchema, runtimeSchema } from "@/lib/cleanup/schema/runtime"
import { snapshotFactsSchema, snapshotItemSchema, sourceStatusSchema } from "@/lib/cleanup/schema/snapshot"
import { ruleStatsSchema, runRuleEntrySchema } from "@/lib/cleanup/schema/stats"
import {
  historyRowSchema,
  plexEpisodeRow,
  plexMovieRow,
  plexSeasonRow,
  plexSectionSchema,
  plexShowRow,
  radarrMovieSchema,
  seerrRequestSchema,
  sonarrEpisodeFileSchema,
  sonarrEpisodeSchema,
  sonarrSeriesFullSchema,
  sonarrSeriesSchema,
} from "@/lib/cleanup/schema/upstream"
import { whySnapshotSchema } from "@/lib/cleanup/schema/why"
import { filtersOf, keysOf, parseSharedServersDocument } from "@/lib/connections/plex-shared-servers-xml"
import { parsePlexTvUsers } from "@/lib/connections/plex-tv-users"
import { plexTvBaseUrl } from "@/lib/security/test-mode"
import { batchIdSchema, itemKeySchema, ruleIdSchema } from "@/lib/validations/cleanup-actions"
import { cleanupOptionsSchema } from "@/lib/validations/cleanup-options"
import { ruleDefinitionSchema } from "@/lib/validations/cleanup-rule"
import type { Level } from "@/lib/validations/cleanup-vocabulary"
import { isCountedPlay, isFinished } from "@/lib/wrapped/sources/watch-history-source"
import { buildOverseerrUserIndex, clearOverseerrUserIndexCache } from "@/lib/connections/overseerr"
import { forEachRequest, runOverseerrJob } from "@/lib/connections/overseerr-cleanup"
import {
  addPlexCollectionItems,
  createPlexCollection,
  deletePlexCollectionGuarded,
  getPlexCollectionHub,
  movePlexCollectionItem,
  removePlexCollectionItem,
  setPlexCollectionSummary,
} from "@/lib/connections/plex-collections"
import { forEachPlexRow, getPlexMetadata, listPlexCollectionItems, listPlexCollections, listPlexSeasonFiles, listPlexSections, PLEX_TYPE } from "@/lib/connections/plex-library-read"
import { readPlayingKeys } from "@/lib/connections/plex-playing"
import { refreshPlexPath } from "@/lib/connections/plex-scan"
import { clearPlexSharedSectionCaches, getSharedSectionFilters, getSharedSectionKeys } from "@/lib/connections/plex-shared-sections"
import { getAllPlexServerUsers } from "@/lib/connections/plex-user-info"
import { getRadarrMovie, listRadarrMovies, listRadarrRootFolders, listRadarrTags } from "@/lib/connections/radarr-library"
import { deleteRadarrMovie, deleteRadarrMovieFile, unmonitorRadarrMovie } from "@/lib/connections/radarr-write"
import { getSonarrSeriesFull, listSonarrEpisodeFiles, listSonarrEpisodes, listSonarrSeries } from "@/lib/connections/sonarr-library"
import { deleteSonarrEpisodeFiles, deleteSonarrSeries, putSonarrSeries, unmonitorSonarrEpisodes } from "@/lib/connections/sonarr-write"
import { forEachHistoryRow } from "@/lib/connections/tautulli-history-all"
import { startMockOverseerr } from "@/e2e/mocks/overseerr-server"
import { startMockPlex } from "@/e2e/mocks/plex-server"
import { startMockPlexTv } from "@/e2e/mocks/plex-tv-server"
import { startMockRadarr } from "@/e2e/mocks/radarr-server"
import type { MockServer } from "@/e2e/mocks/request-log"
import { startMockSonarr } from "@/e2e/mocks/sonarr-server"
import { startMockTautulli } from "@/e2e/mocks/tautulli-server"
import {
  BATCH_MOVIE_COUNT,
  buildCleanupWorld,
  CLEANUP_API_KEYS,
  CLEANUP_COLLECTION,
  checkRule,
  CLEANUP_A11Y_RULE_IDS,
  CLEANUP_MEMBERS,
  CLEANUP_PLEX,
  CLEANUP_RULE_DEFINITIONS,
  cleanupA11ySeedIds,
  cleanupA11ySeedRows,
  cleanupPipelineSeedIds,
  cleanupPipelineSeedRows,
  cleanupSeedIds,
  cleanupSeedRows,
  type CleanupSeedRows,
  type CleanupWorld,
  definitionHash,
  isCountedRow,
  isFinishedRow,
  movieKey,
  plexTvUsersXml,
  showKey,
  seedProtections,
  sharedServersXml,
  UNTRANSCODABLE,
  worldItem,
} from "@/e2e/helpers/cleanup-fixtures"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  sanitizeUrlForLogging: (url: string) => url,
}))
// playwright.config.ts loads dotenv, and only needs @playwright/test to hand the config back
jest.mock("dotenv/config", () => ({}))
jest.mock("@playwright/test", () => ({ defineConfig: (config: unknown) => config, devices: { "Desktop Chrome": {}, "Desktop Safari": {}, "Desktop Firefox": {} } }))

const DAY_S = 86_400
const TODAY = Date.now()
const CLOCKS: [string, number][] = [
  ["today", TODAY],
  ["30 days later", TODAY + 30 * DAY_S * 1000],
]
const PREFIX = "e2e-cleanup"

type SeedCase = [string, (world: CleanupWorld) => CleanupSeedRows]
const SEEDS: SeedCase[] = [
  ["seedCleanup()", (world) => cleanupSeedRows(PREFIX, world)],
  ["seedCleanupA11y()", (world) => cleanupA11ySeedRows(world)],
  ["seedCleanupPipeline()", (world) => cleanupPipelineSeedRows(PREFIX, world)],
]

const items = (world: CleanupWorld) => [...world.snapshot.parts.movie, ...world.snapshot.parts.show, ...world.snapshot.parts.season]

describe.each(CLOCKS)("buildCleanupWorld at %s", (_label, now) => {
  const world = buildCleanupWorld(now)
  const nowS = Math.floor(now / 1000)
  const { facts, sources } = world.snapshot
  const history = world.answers.tautulli.history

  it("stores three parts whose items parse with snapshotItemSchema", () => {
    for (const level of ["movie", "show", "season"] as const) {
      expect(world.snapshot.parts[level].length).toBeGreaterThan(0)
      for (const item of world.snapshot.parts[level]) {
        expect(snapshotItemSchema.safeParse(item)).toEqual(expect.objectContaining({ success: true }))
        expect(item.level).toBe(level)
      }
    }
    expect(world.snapshot.parts.movie).toHaveLength(18 + BATCH_MOVIE_COUNT)
  })

  it("gives every item a key that itemKeySchema accepts, and one key per item", () => {
    const keys = items(world).map((item) => item.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) expect(itemKeySchema.safeParse(key).success).toBe(true)
  })

  it("keeps the newest Tautulli row within 2 days, and the oldest older than now minus 400 days", () => {
    const newest = Math.max(...history.map((row) => row.started))
    const oldest = Math.min(...history.map((row) => row.started))
    expect(nowS - newest).toBeLessThanOrEqual(2 * DAY_S)
    expect(nowS - newest).toBeLessThan(TAUTULLI_STALE_DAYS * DAY_S)
    expect(oldest).toBeLessThan(nowS - 400 * DAY_S)
    expect(oldest).toBeLessThan(nowS - NEVER_WINDOW_DAYS * DAY_S)
    expect(facts.history.newestAt).toBe(newest)
    expect(facts.history.startAt).toBe(oldest)
  })

  it("takes the snapshot at the clock, within STALE_DATA_HOURS, with every source ok", () => {
    expect(Date.parse(facts.takenAt)).toBe(nowS * 1000)
    expect(now - Date.parse(facts.takenAt)).toBeLessThan(STALE_DATA_HOURS * 3600 * 1000)
    expect(sources.length).toBeGreaterThanOrEqual(6)
    for (const source of sources) {
      expect(sourceStatusSchema.safeParse(source).success).toBe(true)
      expect(source.state).toBe("ok")
      expect(source.readAt).toBe(facts.takenAt)
    }
    expect(new Set(sources.map((source) => source.service))).toEqual(new Set(["plex", "tautulli", "overseerr", "radarr", "sonarr"]))
  })

  it("seeds the counts and the row baseline that a read of the mocks gives", () => {
    const rowIds = new Set(history.map((row) => row.row_id))
    const counted = history.filter((row) => isCountedPlay({ playSeconds: row.play_duration, percentComplete: row.percent_complete }))
    const usersWithPlay = new Set(counted.map((row) => String(row.user_id))).size
    const requests = world.answers.overseerr.requests.filter((request) => request.status !== 3)
    const rows = (service: string) => sources.find((source) => source.service === service && source.part !== "shares")?.rows

    expect(rowIds.size).toBe(history.length) // no repeated row_id
    expect(history.every((row) => row.live === 0)).toBe(true)
    expect(facts.history).toEqual(expect.objectContaining({ rows: history.length, orphans: 0, usersWithPlay }))
    // a short play by its own viewer: users with a play count counted plays only
    expect(new Set(history.map((row) => row.user_id)).size).toBe(usersWithPlay + 1)
    expect(rows("tautulli")).toBe(history.length)
    expect(rows("overseerr")).toBe(requests.length)
    expect(rows("radarr")).toBe(world.answers.radarr.movies.length)
    expect(rows("sonarr")).toBe(world.answers.sonarr.series.length)
    expect(facts.rowBaseline).toEqual({ overseerrRequests: requests.length, tautulliRows: history.length, usersWithPlay })
  })

  it("counts plays and finishes as Rewind does (E15)", () => {
    for (const row of history) {
      expect(isCountedRow(row)).toBe(isCountedPlay({ playSeconds: row.play_duration, percentComplete: row.percent_complete }))
      expect(isFinishedRow(row)).toBe(isFinished({ watchedStatus: row.watched_status, percentComplete: row.percent_complete }))
    }
  })

  it("parses its facts with snapshotFactsSchema after the owner is added as P2 adds it (TS 7.2.2)", () => {
    const owner = CLEANUP_PLEX.ownerPlexId
    const withOwner = { ...facts, users: { ...facts.users, [owner]: { ...facts.users[owner], hasAccess: true, owner: true } } }
    const parsed = snapshotFactsSchema.safeParse(withOwner)
    expect(parsed.success).toBe(true)
    expect(owner).toMatch(/^\d+$/)
    expect(Object.values(facts.users).filter((user) => user.owner)).toHaveLength(1)
    expect(facts.users[CLEANUP_MEMBERS.member.plexUserId]).toEqual(expect.objectContaining({ hasAccess: true, owner: false }))
    expect(facts.users[CLEANUP_MEMBERS.filtered.plexUserId]?.hasAccess).toBe(true)
    expect(facts.users[CLEANUP_MEMBERS.noshare.plexUserId]).toBeUndefined()
  })

  it("keeps the pipeline movie's plays older than the seeded takenAt minus 1 day, and it still matches", () => {
    const key = movieKey(world, "pipeline")
    const movie = world.movies.find((candidate) => candidate.key === key)
    const plays = history.filter((row) => String(row.rating_key) === movie?.ratingKey)
    expect(plays.length).toBeGreaterThan(0)
    for (const play of plays) expect(play.stopped).toBeLessThan(Date.parse(facts.takenAt) / 1000 - DAY_S)
    const checks = checkRule(world, CLEANUP_RULE_DEFINITIONS.review, { keeps: [movieKey(world, "kept")], excludes: [] })
    expect(checks.find((check) => check.key === key)?.class).toBe("match")
    expect(checks.find((check) => check.key === movieKey(world, "kept"))).toEqual(expect.objectContaining({ class: "protected", protectedBy: ["g1"] }))
  })

  it("answers in the shapes that the w1-conn-read projections parse", () => {
    const ok = (schema: { safeParse: (value: unknown) => { success: boolean } }, rows: readonly unknown[]) => {
      expect(rows.length).toBeGreaterThan(0)
      for (const row of rows) expect(schema.safeParse(row).success).toBe(true)
    }
    const { plex, radarr, sonarr, overseerr } = world.answers
    ok(plexSectionSchema, plex.sections)
    ok(plexMovieRow, plex.rows["1"][1])
    ok(plexShowRow, plex.rows["2"][2])
    ok(plexSeasonRow, plex.rows["2"][3])
    ok(plexEpisodeRow, plex.rows["2"][4])
    ok(radarrMovieSchema, radarr.movies)
    ok(sonarrSeriesSchema, sonarr.series)
    ok(sonarrSeriesFullSchema, sonarr.series)
    ok(sonarrEpisodeFileSchema, sonarr.episodefiles)
    ok(sonarrEpisodeSchema, sonarr.episodes)
    ok(seerrRequestSchema, overseerr.requests)
    ok(historyRowSchema, history)
  })

  it("keeps Plex and Sonarr season numbers and file counts in step (TS 7.4 E22)", () => {
    for (const series of world.answers.sonarr.series) {
      const show = world.shows.find((candidate) => candidate.arr?.id === series.id)
      const seasons = series.seasons as { seasonNumber: number; statistics: { episodeFileCount: number } }[]
      expect(seasons.map((season) => season.seasonNumber)).toEqual(show?.seasons.map((season) => season.number))
      for (const season of seasons) {
        const files = new Set(show?.seasons[season.seasonNumber - 1].episodes.map((episode) => episode.file))
        expect(season.statistics.episodeFileCount).toBe(files.size)
        expect(files.size).toBe(world.answers.sonarr.episodefiles.filter((file) => file.seriesId === series.id && file.seasonNumber === season.seasonNumber).length)
      }
    }
  })

  it("shares the server with the member and the filtered member only, through the plex.tv answers", () => {
    const users = parsePlexTvUsers(plexTvUsersXml(world))
    expect(users).not.toBeNull()
    const onServer = (users ?? []).filter((user) => user.servers.some((share) => share.machineIdentifier === CLEANUP_PLEX.machineIdentifier && !share.pending))
    expect(onServer.map((user) => user.id).sort()).toEqual([CLEANUP_MEMBERS.member.plexUserId, CLEANUP_MEMBERS.filtered.plexUserId])
    expect(users?.find((user) => user.home && user.restricted && !user.email)).toBeDefined()
    expect(users?.find((user) => user.servers.some((share) => share.pending))).toBeDefined()
    expect(users?.some((user) => user.id === CLEANUP_MEMBERS.noshare.plexUserId)).toBe(false)

    const document = parseSharedServersDocument(sharedServersXml(world))
    expect(document).not.toBeNull()
    const keys = keysOf(document ?? { shares: [] })
    const filters = filtersOf(document ?? { shares: [] })
    expect(keys.get(CLEANUP_MEMBERS.member.plexUserId)).toEqual(new Set(["1", "2"]))
    expect(keys.get(CLEANUP_MEMBERS.filtered.plexUserId)).toEqual(new Set(["2"]))
    expect(filters.get(CLEANUP_MEMBERS.filtered.plexUserId)).toEqual(new Map([["1", `label!=${UNTRANSCODABLE}`], ["2", null]]))
    expect(keys.has(CLEANUP_MEMBERS.noshare.plexUserId)).toBe(false)
  })

  it("labels some movies Untranscodable, which the filtered member does not see", () => {
    const labelled = world.snapshot.parts.movie.filter((item) => item.labels.includes(UNTRANSCODABLE.toLowerCase()))
    expect(labelled.length).toBeGreaterThan(0)
    expect(facts.labelsRead).toContain("1")
  })

  describe.each(SEEDS)("%s", (_name, build) => {
    const rows = build(world)

    it("writes rule ids that ruleIdSchema accepts, with batch ids that batchIdSchema accepts", () => {
      expect(rows.rules.length).toBeGreaterThan(0)
      for (const rule of rows.rules) {
        expect(ruleIdSchema.safeParse(rule.id).success).toBe(true)
        expect(batchIdSchema.safeParse(`deletion-${rule.id}`).success).toBe(true)
        expect(batchIdSchema.safeParse(`entry-${rule.id}`).success).toBe(true)
        expect(ruleDefinitionSchema.safeParse(rule.definition).success).toBe(true)
        expect(ruleStatsSchema.safeParse(rule.stats).success).toBe(true)
      }
      expect(new Set(rows.rules.map((rule) => rule.name)).size).toBe(rows.rules.length)
    })

    it("writes item keys that itemKeySchema accepts, on every table", () => {
      const keys = [...rows.items.map((item) => item.itemKey), ...rows.protections.map((row) => row.itemKey), ...rows.outcomes.map((row) => row.itemKey)]
      expect(keys.length).toBeGreaterThan(0)
      for (const key of keys) expect(itemKeySchema.safeParse(key).success).toBe(true)
      expect(new Set(rows.items.map((item) => item.itemKey)).size).toBe(rows.items.length)
    })

    it("writes stored documents that parse with the w1-contracts schemas", () => {
      expect(cleanupOptionsSchema.safeParse(rows.settings.options).success).toBe(true)
      expect(runtimeSchema.safeParse(rows.settings.runtime).success).toBe(true)
      expect(rows.settings).toEqual(expect.objectContaining({ enabled: true, pausedAt: null, runClaimAt: null, readClaimAt: null, collectionsClaimAt: null }))
      expect(snapshotFactsSchema.safeParse(rows.snapshot.facts).success).toBe(true)
      expect(rows.snapshot).toEqual(expect.objectContaining({ status: "complete" }))
      expect(rows.parts.map((part) => part.level)).toEqual(["movie", "show", "season"])
      for (const part of rows.parts) expect(part.itemCount).toBe(world.snapshot.parts[part.level as Level].length)
      for (const item of rows.items) {
        expect(whySnapshotSchema.safeParse(item.why).success).toBe(true)
        expect(arrRefSchema.safeParse(item.arr).success).toBe(true)
      }
      for (const outcome of rows.outcomes) {
        expect(whySnapshotSchema.safeParse(outcome.why).success).toBe(true)
        if (outcome.detail !== undefined) expect(outcomeDetailSchema.safeParse(outcome.detail).success).toBe(true)
      }
      for (const run of rows.runs) {
        for (const entry of run.entries as unknown[]) expect(runRuleEntrySchema.safeParse(entry).success).toBe(true)
        expect(run.blocks).toEqual([])
      }
    })

    it("holds only items that their rule matches, with the light rule check", () => {
      const protections = seedProtections(rows)
      for (const rule of rows.rules) {
        const checks = new Map(checkRule(world, ruleDefinitionSchema.parse(rule.definition), protections).map((check) => [check.key, check]))
        for (const item of rows.items.filter((row) => (row.ruleIds as string[]).includes(rule.id))) {
          expect({ key: item.itemKey, class: checks.get(item.itemKey)?.class }).toEqual({ key: item.itemKey, class: "match" })
        }
      }
      for (const key of protections.keeps) expect(rows.items.some((item) => item.itemKey === key)).toBe(false)
    })

    it("keeps every leave date and the hold date in day keys, and the hold over", () => {
      const today = new Date(now).toISOString().slice(0, 10)
      expect(String(rows.settings.holdUntil) < today).toBe(true)
      for (const item of rows.items) {
        if (item.state === "held") expect(item.leaveOn).toBeNull()
        else expect(item.leaveOn).toMatch(/^\d{4}-\d{2}-\d{2}$/)
      }
    })
  })

  it("seedCleanup() writes a rule in each mode, items in each state, a batch above 50 and one below, and an entry batch", () => {
    const rows = cleanupSeedRows(PREFIX, world)
    const ids = cleanupSeedIds(PREFIX)
    const today = new Date(now).toISOString().slice(0, 10)
    const batch = (ruleId: string) => rows.items.filter((item) => item.state === "leaving" && item.needsApproval && String(item.leaveOn) <= today
      && (item.ruleIds as string[])[0] === ruleId)
    expect(new Set(rows.rules.map((rule) => rule.mode))).toEqual(new Set(["dryRun", "reviewFirst", "automatic"]))
    expect(new Set(rows.items.map((item) => item.state))).toEqual(new Set(["held", "leaving", "approved", "deleting"]))
    expect(batch(ids.rules.review).length).toBe(BATCH_MOVIE_COUNT + 1)
    expect(batch(ids.rules.review).length).toBeGreaterThan(50)
    expect(batch(ids.rules.shows).length).toBe(3)
    expect(rows.items.filter((item) => item.state === "held" && (item.ruleIds as string[]).includes(ids.rules.seasons))).toHaveLength(3)
    expect(rows.protections.map((row) => row.kind).sort()).toEqual(["adminExclude", "adminExclude", "memberKeep", "memberKeep"])
    expect(rows.runs.map((run) => run.kind).sort()).toEqual(["act", "dryRun", "run"])
    expect(new Set(rows.outcomes.map((row) => row.kind))).toEqual(new Set(["deleted", "failed", "rescued", "released"]))
    for (const row of [...rows.rules, ...rows.items, ...rows.protections, ...rows.runs, ...rows.outcomes, rows.snapshot, ...rows.parts]) {
      expect(row.id?.startsWith(`${PREFIX}-`)).toBe(true)
    }
  })

  it("seedCleanupA11y() keeps the fixed rule ids, with a deletion batch of the live rule and a Keep of the member", () => {
    const rows = cleanupA11ySeedRows(world)
    expect(rows.rules.map((rule) => rule.id)).toEqual([CLEANUP_A11Y_RULE_IDS.dry, CLEANUP_A11Y_RULE_IDS.live])
    expect(rows.rules.map((rule) => rule.mode)).toEqual(["dryRun", "reviewFirst"])
    expect(cleanupA11ySeedIds().batches.live).toBe("deletion-a11y-cleanup-rule-live")
    const conditions = (rows.rules[0].definition as { conditions: { id: string }[] }).conditions.map((condition) => condition.id)
    expect(conditions).toContain("c2")
    const today = new Date(now).toISOString().slice(0, 10)
    expect(rows.items.filter((item) => String(item.leaveOn) <= today && item.needsApproval).length).toBeGreaterThan(0)
    expect(rows.protections.find((row) => row.kind === "memberKeep")?.memberId).toBe(CLEANUP_MEMBERS.member.id)
    for (const row of [...rows.items, ...rows.protections, ...rows.runs, ...rows.outcomes, rows.snapshot]) expect(row.id?.startsWith("a11y-cleanup-")).toBe(true)
  })

  it("seedCleanupPipeline() holds one due movie that waits for approval, with the exclusion on", () => {
    const rows = cleanupPipelineSeedRows(PREFIX, world)
    const today = new Date(now).toISOString().slice(0, 10)
    expect(rows.rules).toHaveLength(1)
    expect(rows.rules[0]).toEqual(expect.objectContaining({ id: cleanupPipelineSeedIds(PREFIX).rule, mode: "reviewFirst" }))
    expect(rows.items).toEqual([expect.objectContaining({ itemKey: movieKey(world, "pipeline"), state: "leaving", needsApproval: true,
      action: "movie.delete", importListExclusion: true })])
    expect(String(rows.items[0].leaveOn) < today).toBe(true)
    expect(rows.protections).toEqual([expect.objectContaining({ kind: "memberKeep", itemKey: movieKey(world, "kept"), status: "active" })])
    // The Plex mock's collection holds the pipeline movie, as runtime.collections says (TS 16.4 pipeline step 1)
    const collection = world.answers.plex.collections.find((candidate) => candidate.title === "Movies leaving soon")
    expect(collection?.items).toEqual([worldItem(world, movieKey(world, "pipeline")).ratingKey])
  })
})

describe("cleanup seed ids", () => {
  it("refuses a prefix that makes a rule id longer than RULE_ID_PATTERN allows", () => {
    const world = buildCleanupWorld(TODAY)
    expect(() => cleanupSeedRows("x".repeat(40), world)).toThrow(/RULE_ID_PATTERN/)
  })

  it("hashes a definition the same way whatever its key order", () => {
    const definition = CLEANUP_RULE_DEFINITIONS.review
    const reordered = Object.fromEntries(Object.entries(definition).reverse())
    expect(definitionHash(reordered)).toBe(definitionHash(definition))
    expect(definitionHash(definition)).toMatch(/^[a-f0-9]{16}$/)
  })

  it("knows every block code it could meet", () => {
    expect(BLOCK_CODES).toEqual(expect.arrayContaining(["dataStale", "sourceFailed", "tautulliStale", "historyShort", "sourceShrank"]))
  })
})

describe("playwright.config.ts and the plex.tv mock", () => {
  const original = { ...process.env }

  afterEach(() => {
    process.env = { ...original }
    jest.restoreAllMocks()
  })

  function load(port?: string): PlaywrightTestConfig {
    // afterEach replaces process.env, so read it fresh here
    const env = process.env as Record<string, string | undefined>
    env.E2E_DATABASE_URL = "postgresql://postgres:pw@localhost:5433/plex_manager_test?schema=public"
    if (port) env.E2E_PORT = port
    else delete env.E2E_PORT
    jest.spyOn(console, "log").mockImplementation(() => {})
    let config: PlaywrightTestConfig | undefined
    jest.isolateModules(() => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      config = require("../../playwright.config").default
    })
    if (!config) throw new Error("playwright.config.ts did not export a config")
    return config
  }

  it.each([
    [undefined, "http://127.0.0.1:4100"],
    ["3200", "http://127.0.0.1:4200"],
  ])("gives the web server and the global setup one fixed plex.tv URL (E2E_PORT %s)", (port, url) => {
    const config = load(port)
    const webServer = Array.isArray(config.webServer) ? undefined : config.webServer
    expect(webServer?.env?.E2E_PLEX_TV_URL).toBe(url)
    expect(process.env.E2E_PLEX_TV_URL).toBe(url)
    // The seam accepts it in E2E test mode only (TS E27)
    expect(plexTvBaseUrl({ E2E_TEST_MODE: "true", E2E_PLEX_TV_URL: url })).toEqual({ plexTv: url, clients: url })
    expect(plexTvBaseUrl({ E2E_PLEX_TV_URL: url }).plexTv).toBe("https://plex.tv")
  })
})

describe("the w1-conn-read and w1-conn-write clients against the mocks", () => {
  let mocks: Record<"plex" | "plexTv" | "radarr" | "sonarr" | "overseerr" | "tautulli", MockServer>
  const world = buildCleanupWorld(Date.now())
  const original = { ...process.env }
  const plexConfig = () => ({ url: mocks.plex.url, token: CLEANUP_PLEX.token })
  const arr = (mock: "radarr" | "sonarr") => ({ url: mocks[mock].url, apiKey: CLEANUP_API_KEYS[mock] })

  beforeAll(async () => {
    const [plex, plexTv, radarr, sonarr, overseerr, tautulli] = await Promise.all([startMockPlex(), startMockPlexTv(0), startMockRadarr(), startMockSonarr(),
      startMockOverseerr(), startMockTautulli()])
    mocks = { plex, plexTv, radarr, sonarr, overseerr, tautulli }
    // The plex.tv seam of TS E27, as the E2E web server has it
    Object.assign(process.env, { E2E_TEST_MODE: "true", E2E_PLEX_TV_URL: plexTv.url, PLEX_CLIENT_IDENTIFIER: "e2e-cleanup-client" })
  })

  afterEach(() => {
    jest.useRealTimers()
  })

  afterAll(async () => {
    process.env = { ...original }
    clearPlexSharedSectionCaches()
    clearOverseerrUserIndexCache()
    await Promise.all(Object.values(mocks).map((mock) => mock.close()))
  })

  it("reads the Plex library: sections, every listing type, collections, metadata, children and sessions", async () => {
    const sections = await listPlexSections(plexConfig())
    expect(sections.ok && sections.data.map((section) => section.key)).toEqual(["1", "2"])
    const count = async (sectionId: string, type: (typeof PLEX_TYPE)[keyof typeof PLEX_TYPE]) => {
      const result = await forEachPlexRow(plexConfig(), sectionId, type, z.unknown(), () => undefined)
      return result.ok ? result.data.rows : result.code
    }
    expect(await count("1", PLEX_TYPE.movie)).toBe(world.movies.length)
    expect(await count("2", PLEX_TYPE.show)).toBe(world.shows.length)
    expect(await count("2", PLEX_TYPE.season)).toBe(world.snapshot.parts.season.length)
    expect(await count("2", PLEX_TYPE.episode)).toBe(world.answers.plex.rows["2"][4].length)
    const collections = await listPlexCollections(plexConfig(), "1")
    expect(collections.ok && collections.data.map((row) => row.title)).toEqual(["Movies leaving soon", "Rainy Sunday Picks"])
    const pipeline = worldItem(world, movieKey(world, "pipeline"))
    const members = await listPlexCollectionItems(plexConfig(), CLEANUP_COLLECTION.ratingKey)
    expect(members.ok && members.data.map((row) => row.ratingKey)).toEqual([pipeline.ratingKey])
    const metadata = await getPlexMetadata(plexConfig(), pipeline.ratingKey)
    expect(metadata.ok && metadata.data.librarySectionID).toBe("1")
    expect(await getPlexMetadata(plexConfig(), "999999")).toEqual(expect.objectContaining({ ok: false, code: "HTTP", status: 404 }))
    const season = worldItem(world, showKey(world, "auto-a", 1))
    const files = await listPlexSeasonFiles(plexConfig(), season.ratingKey)
    expect(files.ok && files.data.size).toBe(season.episodeCount)
    expect(await readPlayingKeys(plexConfig())).toEqual({ ok: true, data: new Set() })
    expect((await refreshPlexPath(plexConfig(), "1", pipeline.arr?.path ?? "")).ok).toBe(true)
    expect(await listPlexSections({ url: mocks.plex.url, token: "test-token" })).toEqual(expect.objectContaining({ ok: false, status: 401 }))
  })

  it("syncs a Plex collection: create, add, move, remove, summary, hub and the guarded delete", async () => {
    const created = await createPlexCollection(plexConfig(), { sectionId: "1", level: "movie", title: "Movies leaving soon" })
    if (!created.ok) throw new Error(created.code)
    const keys = world.snapshot.parts.movie.slice(0, 3).map((item) => item.ratingKey)
    const mid = { ...plexConfig(), machineIdentifier: CLEANUP_PLEX.machineIdentifier }
    expect((await addPlexCollectionItems(mid, created.data.ratingKey, keys)).ok).toBe(true)
    expect((await movePlexCollectionItem(plexConfig(), created.data.ratingKey, keys[2], null)).ok).toBe(true)
    expect((await removePlexCollectionItem(plexConfig(), created.data.ratingKey, keys[0])).ok).toBe(true)
    const members = await listPlexCollectionItems(plexConfig(), created.data.ratingKey)
    expect(members.ok && members.data.map((row) => row.ratingKey)).toEqual([keys[2], keys[1]])
    expect((await setPlexCollectionSummary(plexConfig(), { sectionId: "1", ratingKey: created.data.ratingKey, summary: "Leaving soon" })).ok).toBe(true)
    const hub = await getPlexCollectionHub(plexConfig(), "1", CLEANUP_COLLECTION.ratingKey)
    expect(hub).toEqual({ ok: true, data: expect.objectContaining({ ownHome: true, sharedHome: true, recommended: false }) })
    // The guard reads the metadata first, and deletes only a collection of the stored section and title (TS 8.10 step 3.1)
    expect(await deletePlexCollectionGuarded(plexConfig(), { ratingKey: CLEANUP_COLLECTION.ratingKey, sectionId: "2", title: CLEANUP_COLLECTION.title }))
      .toEqual({ ok: true, data: { guarded: true, reason: "section" } })
    expect(await deletePlexCollectionGuarded(plexConfig(), { ...CLEANUP_COLLECTION }))
      .toEqual({ ok: true, data: { guarded: false, gone: false } })
    expect(await deletePlexCollectionGuarded(plexConfig(), { ...CLEANUP_COLLECTION })).toEqual({ ok: true, data: { guarded: false, gone: true } })
    expect((await mocks.plex.requests()).filter((call) => call.method === "DELETE").every((call) => call.path.startsWith("/library/collections/"))).toBe(true)
  })

  it("reads and writes Radarr as the act step does", async () => {
    const movies = await listRadarrMovies(arr("radarr"))
    expect(movies.ok && movies.data.length).toBe(world.answers.radarr.movies.length)
    expect((await listRadarrRootFolders(arr("radarr"))).ok).toBe(true)
    expect((await listRadarrTags(arr("radarr"))).ok).toBe(true)
    const pipeline = worldItem(world, movieKey(world, "pipeline"))
    const id = pipeline.arr?.id ?? 0
    expect((await getRadarrMovie(arr("radarr"), id)).ok).toBe(true)
    expect(await getRadarrMovie(arr("radarr"), 999999)).toEqual(expect.objectContaining({ ok: false, code: "HTTP", status: 404 }))
    expect(await unmonitorRadarrMovie(arr("radarr"), id)).toEqual({ ok: true, data: null })
    expect(await deleteRadarrMovieFile(arr("radarr"), pipeline.arr?.fileId ?? 0)).toEqual({ ok: true, data: { gone: false } })
    expect(await deleteRadarrMovie(arr("radarr"), id, { importListExclusion: true })).toEqual({ ok: true, data: { gone: false } })
    expect(await deleteRadarrMovie(arr("radarr"), id, { importListExclusion: true })).toEqual({ ok: true, data: { gone: true } })
    expect(await listRadarrMovies({ url: mocks.radarr.url, apiKey: "another-key" })).toEqual(expect.objectContaining({ ok: false, status: 401 }))
  })

  it("reads and writes Sonarr as the season and show actions do", async () => {
    const series = await listSonarrSeries(arr("sonarr"))
    expect(series.ok && series.data.length).toBe(world.answers.sonarr.series.length)
    const season = worldItem(world, showKey(world, "auto-a", 1))
    const seriesId = season.arr?.id ?? 0
    const full = await getSonarrSeriesFull(arr("sonarr"), seriesId)
    if (!full.ok) throw new Error(full.code)
    const files = await listSonarrEpisodeFiles(arr("sonarr"), seriesId)
    const own = files.ok ? files.data.filter((file) => file.seasonNumber === 1) : []
    expect(own).toHaveLength(season.episodeCount ?? -1)
    const episodes = await listSonarrEpisodes(arr("sonarr"), seriesId, 1)
    expect(episodes.ok && episodes.data.every((episode) => episode.monitored)).toBe(true)
    const body = { ...full.data, seasons: full.data.seasons.map((entry) => (entry.seasonNumber === 1 ? { ...entry, monitored: false } : entry)) }
    expect(await putSonarrSeries(arr("sonarr"), body)).toEqual({ ok: true, data: null })
    expect(await unmonitorSonarrEpisodes(arr("sonarr"), episodes.ok ? episodes.data.map((episode) => episode.id) : [])).toEqual({ ok: true, data: null })
    expect(await deleteSonarrEpisodeFiles(arr("sonarr"), own.map((file) => file.id))).toEqual({ ok: true, data: { deleted: own.length } })
    const after = await listSonarrEpisodeFiles(arr("sonarr"), seriesId)
    expect(after.ok && after.data.some((file) => file.seasonNumber === 1)).toBe(false)
    // Sonarr answers 500, not 404, for a series that is gone (TS 8.9 step 6)
    expect(await deleteSonarrSeries(arr("sonarr"), 999999, { importListExclusion: false })).toEqual(expect.objectContaining({ ok: false, code: "HTTP", status: 500 }))
  })

  it("reads Overseerr's users and requests, and starts the availability sync", async () => {
    const config = { url: mocks.overseerr.url, apiKey: CLEANUP_API_KEYS.overseerr }
    const index = await buildOverseerrUserIndex(config)
    expect(index.ok && [...index.data.keys()].map(String).sort()).toEqual(["9400000", "9400101", "9400102", "9400201"])
    const all = await forEachRequest(config, () => undefined)
    expect(all.ok && all.data.rows).toBe(world.answers.overseerr.requests.length)
    // The pre-delete form: newest first, until a request is older than `until`
    const recent = await forEachRequest(config, () => undefined, { until: Date.now() - 30 * 86_400_000 })
    expect(recent.ok && recent.data.rows).toBe(1)
    expect(await runOverseerrJob(config, "availability-sync")).toEqual({ ok: true, data: null })
  })

  it("reads the Tautulli history in both forms", async () => {
    const config = { url: mocks.tautulli.url, apiKey: CLEANUP_API_KEYS.tautulli }
    const all = await forEachHistoryRow(config, {}, () => undefined)
    expect(all).toEqual({ ok: true, data: { rows: world.answers.tautulli.history.length, pages: 1, complete: true } })
    const day = (ms: number) => new Date(ms).toISOString().slice(0, 10)
    const keyOf = (role: string) => worldItem(world, movieKey(world, role)).ratingKey
    const since = day(Date.now() - 3 * 86_400_000)
    const read = (role: string) => {
      const rows: unknown[] = []
      return forEachHistoryRow(config, { after: since, ratingKeys: { column: "rating_key", keys: [keyOf(role)] } }, (page) => {
        rows.push(...page)
      }).then((result) => (result.ok ? rows.length : result.code))
    }
    expect(await read("pipeline")).toBe(0)
    expect(await read("recent")).toBe(1)
  })

  it("asks plex.tv as the member pages and the read do", async () => {
    // fetchWithTimeout leaves its body timer armed (timeoutCoversBody, 15 s for /api/users). Fake timers that follow the
    // real clock keep the same timing, and no real timer outlives the test.
    jest.useFakeTimers({ advanceTimers: true, doNotFake: ["nextTick", "setImmediate", "queueMicrotask", "performance", "hrtime"] })
    const server = { url: mocks.plex.url, token: CLEANUP_PLEX.token, adminPlexUserId: CLEANUP_PLEX.ownerPlexId }
    expect(await getSharedSectionKeys(server, CLEANUP_MEMBERS.member.plexUserId)).toEqual(new Set(["1", "2"]))
    expect(await getSharedSectionKeys(server, CLEANUP_MEMBERS.filtered.plexUserId)).toEqual(new Set(["2"]))
    expect(await getSharedSectionKeys(server, CLEANUP_MEMBERS.noshare.plexUserId)).toEqual(new Set())
    expect(await getSharedSectionFilters(server, CLEANUP_MEMBERS.filtered.plexUserId)).toEqual(new Map([["1", `label!=${UNTRANSCODABLE}`], ["2", null]]))
    const users = await getAllPlexServerUsers(server)
    expect(users.success && users.data?.map((user) => ({ id: user.id, managed: user.managed, pending: user.pending }))).toEqual([
      { id: CLEANUP_MEMBERS.member.plexUserId, managed: false, pending: false },
      { id: CLEANUP_MEMBERS.filtered.plexUserId, managed: false, pending: false },
      { id: "9400104", managed: true, pending: false },
      { id: "9400105", managed: false, pending: true },
    ])
    // Every other token gets 401, as plex.tv answers for test-token
    expect(await getAllPlexServerUsers({ ...server, token: "test-token", machineIdentifier: CLEANUP_PLEX.machineIdentifier }))
      .toEqual(expect.objectContaining({ success: false }))
  })
})
