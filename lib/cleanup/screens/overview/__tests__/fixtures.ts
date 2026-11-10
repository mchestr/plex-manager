/**
 * Fixtures for the rule and settings loader tests: snapshot items that the
 * real engine matches or keeps safe, stored rules with dry runs of their
 * definition, and the Prisma mock defaults that every loader reads. Every
 * value is invented.
 *
 * @internal Test-only.
 * @module lib/cleanup/screens/overview/__tests__/fixtures
 */

import { buildCleanupRule, buildCleanupSettings } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildMovieItem, buildShowItem, buildSourceStatuses, daysAgo, NOW } from "@/lib/cleanup/__tests__/helpers/builders"
import { loadedSnapshot } from "@/lib/cleanup/member/__tests__/fixtures"
import { definitionHash } from "@/lib/cleanup/run/turn-on-review"
import type { SnapshotFacts, SnapshotItem, SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { LoadedSnapshot } from "@/lib/cleanup/snapshot/cache"
import type { CleanupRule, CleanupSettings } from "@/lib/generated/prisma/client"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import { GiB } from "@/lib/validations/cleanup-vocabulary"

/** @internal The admin session that `assertAdmin()` returns. */
export const ADMIN = { user: { id: "admin-1", isAdmin: true }, expires: "" }
/** @internal `NOW` as a date. */
export const AT = new Date(NOW)

/** @internal Every source ok, with the row counts of the facts' baseline, so no source shrank. */
export const SOURCES: SourceStatus[] = buildSourceStatuses({ overseerr: { rows: 300 }, tautulli: { rows: 5000 } })

/** @internal The newest complete snapshot holding `items`, read at `NOW`, with `SOURCES` unless given. */
export function snapshotOf(items: readonly SnapshotItem[], options: { sources?: SourceStatus[]; facts?: Partial<SnapshotFacts> } = {}): LoadedSnapshot {
  const base = loadedSnapshot(items, options.facts)
  return { ...base, header: { ...base.header, sources: options.sources ?? SOURCES } }
}

const noPlays = { lastCountedAt: null, countedAt: [], viewers: [] }
const playedDaysAgo = (days: number) => ({ lastCountedAt: daysAgo(days), countedAt: [daysAgo(days)], viewers: [
  { user: "100", lastCountedAt: daysAgo(days), lastCountedFinished: true, counted: 1, finished: true, finishedEpisodes: 0 },
] })

/** @internal A movie `n` in library 1 of `gib` GiB, with overrides. */
export function movie(n: number, gib: number, overrides: Partial<SnapshotItem> = {}): SnapshotItem {
  return buildMovieItem({ key: `movie:tmdb:${n}`, titleKey: `tmdb:${n}`, title: `Invented Movie ${n}`, ratingKey: String(5100 + n),
    copies: [{ ratingKey: String(5100 + n), sectionId: "1" }], ids: { tmdb: n }, sizeBytes: gib * GiB, ...overrides })
}

/** @internal A show `n` in library 2 of `gib` GiB, with overrides. */
export function show(n: number, gib: number, overrides: Partial<SnapshotItem> = {}): SnapshotItem {
  return buildShowItem({ key: `show:tvdb:${n}`, titleKey: `tvdb:${n}`, title: `Invented Show ${n}`, ratingKey: String(6100 + n),
    copies: [{ ratingKey: String(6100 + n), sectionId: "2" }], ids: { tvdb: n }, sizeBytes: gib * GiB, ...overrides })
}

/**
 * @internal The library: m1 never played (50 GiB), m2 played 500 days ago
 * (30 GiB), m3 played 10 days ago (G4 keeps it safe), m4 never played but
 * with no Radarr record (Cannot delete), and the ended show s1 played 400
 * days ago (100 GiB).
 */
export const ITEMS: readonly SnapshotItem[] = [
  movie(1, 50, { plays: noPlays }),
  movie(2, 30, { plays: playedDaysAgo(500) }),
  movie(3, 20, { plays: playedDaysAgo(10) }),
  movie(4, 10, { plays: noPlays, match: { state: "unmatched", cause: "noArrRecord" } }),
  show(1, 100, { plays: playedDaysAgo(400) }),
]

/** @internal Movies never played or not played in a year, in library 1, deleted after 30 days. */
export const MOVIE_DEFINITION: RuleDefinition = {
  schemaVersion: 1,
  level: "movie",
  libraries: ["1"],
  conditions: [{ id: "c1", field: "watch.lastPlayed", op: "moreThan", value: { duration: { amount: 365, unit: "days" }, orNever: true } }],
  protections: [],
  then: { graceDays: 30, action: "movie.delete", importListExclusion: true },
}

/** @internal Ended whole shows in library 2. */
export const SHOW_DEFINITION: RuleDefinition = {
  schemaVersion: 1,
  level: "show",
  libraries: ["2"],
  conditions: [{ id: "c1", field: "show.status", op: "is", value: { status: "ended" } }],
  protections: [],
  then: { graceDays: 30, action: "show.delete", importListExclusion: false },
}

/** @internal One dry run of `definition` a day for each count of `matches`, each on its own library read, the newest one day before `NOW`. */
export function dryRuns(definition: RuleDefinition, matches: readonly number[]) {
  return matches.map((count, i) => ({ at: new Date(NOW - (matches.length - i) * 86_400_000).toISOString(), runId: `run-${i}`,
    snapshotId: `snap-${i}`, matches: count, bytes: count * GiB, definitionHash: definitionHash(definition) }))
}

/** @internal A stored rule row. */
export function storedRule(id: string, name: string, overrides: Partial<CleanupRule> = {}): CleanupRule {
  return buildCleanupRule({ id, name, definition: MOVIE_DEFINITION, stats: {}, createdAt: new Date(NOW - 90 * 86_400_000), ...overrides })
}

/** @internal The Prisma reads of every loader: the settings row, no zone, no rule, row, outcome, run or user. */
export function mockStoredDefaults(settings: Partial<CleanupSettings> = {}): void {
  prismaMock.cleanupSettings.findUnique.mockResolvedValue(buildCleanupSettings(settings))
  prismaMock.config.findUnique.mockResolvedValue(null)
  prismaMock.cleanupRule.findMany.mockResolvedValue([])
  prismaMock.cleanupRule.findUnique.mockResolvedValue(null)
  prismaMock.cleanupItem.findMany.mockResolvedValue([])
  prismaMock.cleanupOutcome.findMany.mockResolvedValue([])
  prismaMock.cleanupRun.findFirst.mockResolvedValue(null)
  prismaMock.user.findMany.mockResolvedValue([])
  prismaMock.user.findUnique.mockResolvedValue(null)
}
