/**
 * @jest-environment node
 */

/**
 * The E2E cleanup data against the real safety stops (TS 16.4 data rule 6,
 * plan D17, delivery-r3-7). `buildCleanupWorld(now)` is built at two clocks,
 * today and 30 days later. Two snapshots are checked at each clock: the one
 * the seeds store, and the one that a read of the mocks gives. That one is
 * built as the read does: the mock answers parsed with the `w1-conn-read`
 * projections, fed to `createSnapshotBuilder()`, the owner added as P2 adds
 * it, and `rowBaseline()` against the stored snapshot. So the real counting
 * rules apply: repeated `row_id` rows, counted plays only in
 * `usersWithPlay`, and the owner.
 *
 * Every seeded live rule must have no safety stop (`ruleBlocks()`), and every
 * seeded turn-on rule no failed check that stops a turn-on (`turnOnChecks()`).
 * A failure here is a gap in the wave 2 E2E data, fixed at the wave 3 gate.
 */

import { buildLiveFacts } from "@/lib/cleanup/__tests__/helpers/builders"
import { classify } from "@/lib/cleanup/engine/classify"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { buildEvalContext } from "@/lib/cleanup/engine/context"
import { evaluateRule } from "@/lib/cleanup/engine/evaluate"
import type { ArrRead } from "@/lib/cleanup/identity/arr"
import { type BlockSnapshot, ruleBlocks } from "@/lib/cleanup/rule-blocks"
import { snapshotFactsSchema, type SnapshotItem, sourceStatusSchema } from "@/lib/cleanup/schema/snapshot"
import { parseRuleStats } from "@/lib/cleanup/schema/stats"
import {
  arrDiskSchema,
  arrImportListSchema,
  arrRootFolderSchema,
  arrTagSchema,
  historyRowSchema,
  plexEpisodeRow,
  plexMovieRow,
  plexSeasonRow,
  plexSectionSchema,
  plexShowRow,
  radarrMovieSchema,
  seerrRequestSchema,
  sonarrSeriesSchema,
} from "@/lib/cleanup/schema/upstream"
import { rowBaseline } from "@/lib/cleanup/snapshot/baseline"
import { createSnapshotBuilder } from "@/lib/cleanup/snapshot/builder"
import { checkStops, turnOnChecks } from "@/lib/cleanup/turn-on"
import { parseCleanupOptions } from "@/lib/validations/cleanup-options"
import { ruleDefinitionSchema } from "@/lib/validations/cleanup-rule"
import { LEVELS, type Level } from "@/lib/validations/cleanup-vocabulary"
import {
  buildCleanupWorld,
  CLEANUP_PLEX,
  cleanupA11ySeedRows,
  cleanupPipelineSeedRows,
  cleanupSeedRows,
  type CleanupSeedRows,
  type CleanupWorld,
  definitionHash,
  seedProtections,
} from "@/e2e/helpers/cleanup-fixtures"

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
}))

const DAY_MS = 86_400_000
const TODAY = Date.now()
const CLOCKS: [string, number][] = [
  ["today", TODAY],
  ["30 days later", TODAY + 30 * DAY_MS],
]
const PREFIX = "e2e-cleanup"
const SEEDS: [string, (world: CleanupWorld) => CleanupSeedRows][] = [
  ["seedCleanup()", (world) => cleanupSeedRows(PREFIX, world)],
  ["seedCleanupA11y()", (world) => cleanupA11ySeedRows(world)],
  ["seedCleanupPipeline()", (world) => cleanupPipelineSeedRows(PREFIX, world)],
]

/** The snapshot a seed stores: its header row, parsed. */
function seededSnapshot(rows: CleanupSeedRows): BlockSnapshot {
  const { snapshot } = rows
  return {
    finishedAt: snapshot.finishedAt instanceof Date ? snapshot.finishedAt : new Date(String(snapshot.finishedAt)),
    sources: sourceStatusSchema.array().parse(snapshot.sources),
    facts: snapshotFactsSchema.parse(snapshot.facts),
  }
}

const parseAll = <T>(parse: (value: unknown) => T, rows: readonly unknown[] | undefined): T[] => (rows ?? []).map(parse)

/** The snapshot that a read of the mocks gives (TS 7.3), with `rowBaseline()` against the stored one. */
function readSnapshot(world: CleanupWorld, stored: BlockSnapshot): BlockSnapshot & { items: Record<Level, SnapshotItem[]> } {
  const { plex, radarr, sonarr, overseerr, tautulli, plexTv } = world.answers
  const takenAt = new Date(world.now).toISOString()
  const sections = parseAll((r) => plexSectionSchema.parse(r), plex.sections)
  const builder = createSnapshotBuilder({ takenAt, sections })
  for (const section of sections) {
    const rows = plex.rows[section.key] ?? {}
    if (section.type === "movie") builder.addMovies(section.key, parseAll((r) => plexMovieRow.parse(r), rows[1]))
    if (section.type !== "show") continue
    builder.addShows(section.key, parseAll((r) => plexShowRow.parse(r), rows[2]))
    builder.addSeasons(section.key, parseAll((r) => plexSeasonRow.parse(r), rows[3]))
    builder.addEpisodes(section.key, parseAll((r) => plexEpisodeRow.parse(r), rows[4]))
  }
  builder.addHistory(parseAll((r) => historyRowSchema.parse(r), tautulli.history))
  builder.addRequests(parseAll((r) => seerrRequestSchema.parse(r), overseerr.requests))
  const arr = <R>(records: R[], answers: { rootfolder: unknown[]; tags: unknown[]; importlists: unknown[]; diskspace: unknown[] }): ArrRead<R> => ({
    records, rootFolders: arrRootFolderSchema.parse(answers.rootfolder), tags: arrTagSchema.parse(answers.tags),
    importLists: arrImportListSchema.parse(answers.importlists), disk: arrDiskSchema.parse(answers.diskspace),
  })
  // P2: accepted shares of this server and managed Home users; the owner comes from the server row
  const userIds = plexTv.users.filter((user) => (user.share ? !user.share.pending : user.home)).map((user) => user.id)
  const overseerrUsers = new Map(overseerr.users.map((user) => [Number(user.plexId), Number(user.id)]))
  const { items, facts } = builder.finish({
    sources: stored.sources,
    access: { userIds, ownerId: CLEANUP_PLEX.ownerPlexId, machineIdentifier: CLEANUP_PLEX.machineIdentifier },
    radarr: arr(radarr.movies.map((r) => radarrMovieSchema.parse(r)), radarr),
    sonarr: arr(sonarr.series.map((r) => sonarrSeriesSchema.parse(r)), sonarr),
    overseerrUsers,
  })
  const read = { ...facts, rowBaseline: rowBaseline({ sources: stored.sources, facts: stored.facts }, { trigger: "scheduled", sources: stored.sources, facts }) }
  return { finishedAt: new Date(world.now), sources: stored.sources, facts: snapshotFactsSchema.parse(read), items }
}

describe.each(CLOCKS)("the E2E cleanup data at %s", (_label, now) => {
  const world = buildCleanupWorld(now)

  describe.each(SEEDS)("%s", (_seed, build) => {
    const rows = build(world)
    const options = parseCleanupOptions(rows.settings.options)
    const stored = seededSnapshot(rows)
    const read = readSnapshot(world, stored)
    const rules = rows.rules.map((rule) => ({ id: rule.id, mode: rule.mode, stats: rule.stats, definition: ruleDefinitionSchema.parse(rule.definition) }))
    const snapshots: [string, BlockSnapshot][] = [["the seeded snapshot", stored], ["a read of the mocks", read]]

    it("reads the same items from the mocks as the seed stores", () => {
      for (const level of LEVELS) expect(read.items[level].map((item) => item.key).sort()).toEqual(world.snapshot.parts[level].map((item) => item.key).sort())
      expect(read.facts.history).toEqual(stored.facts.history)
      expect(read.facts.rowBaseline).toEqual(stored.facts.rowBaseline)
    })

    it.each(snapshots)("gives no safety stop to a seeded live rule on %s", (_name, snapshot) => {
      const live = rules.filter((rule) => rule.mode !== "dryRun")
      expect(live.length).toBeGreaterThan(0)
      for (const rule of live) expect({ rule: rule.id, blocks: ruleBlocks(rule.definition, snapshot, { now, options, ruleId: rule.id }) }).toEqual({ rule: rule.id, blocks: [] })
    })

    it.each(snapshots)("gives a seeded turn-on rule no failed check that stops a turn-on on %s", (_name, snapshot) => {
      const protections = seedProtections(rows)
      const expiresAt = new Date(now + 30 * DAY_MS)
      const live = buildLiveFacts({
        keeps: protections.keeps.map((itemKey, i) => ({ id: `keep-${i}`, itemKey, memberId: `member-${i}`, expiresAt })),
        excludes: protections.excludes.map((itemKey, i) => ({ id: `exclude-${i}`, itemKey, expiresAt: null, createdBy: "admin-user-id" })),
      })
      const items = snapshot === stored ? world.snapshot.parts : read.items
      const ctx = buildEvalContext({ now, zone: world.timeZone, facts: snapshot.facts, sources: snapshot.sources, shows: items.show, live, options })
      for (const rule of rules.filter((r) => r.mode === "dryRun")) {
        const results = evaluateRule(compileDefinition(rule.definition), items[rule.definition.level], ctx)
        const classes = results.map((result) => classify(result).class)
        const counts = { count: classes.filter((c) => c === "match").length, checked: results.length, cannotDelete: classes.filter((c) => c === "cannotDelete").length }
        const checks = turnOnChecks({ now, feature: { enabled: true, paused: false }, rule: { id: rule.id, definition: rule.definition }, snapshot, options,
          dryRuns: parseRuleStats(rule.stats).dryRuns, definitionHash: definitionHash(rule.definition), counts, firstBatch: true, notices: [] })
        expect(counts.count).toBeGreaterThan(0)
        expect({ rule: rule.id, stops: checks.filter((check) => checkStops(check, "reviewFirst")) }).toEqual({ rule: rule.id, stops: [] })
      }
    })
  })
})
