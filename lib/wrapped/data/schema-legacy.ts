/**
 * Lenient Zod schemas for stored v1 and v2 Rewinds (`PlexWrapped.data`).
 *
 * ## Overview
 *
 * These schemas are the one declaration of the v1/v2 `WrappedData` shape:
 * `types/wrapped.ts` re-exports their inferred types under the names the v2
 * viewer already uses, so the viewer and the generator share one contract
 * with the stored-data parser (`./parse-stored.ts`, DUP-10).
 *
 * ## Leniency
 *
 * Stored rows were written by several releases, and some by the admin
 * playground without validation. Any object parses; within it:
 * - a malformed count reads as 0, and a malformed optional part as absent;
 * - list items are checked one by one, so one bad item is dropped without
 *   emptying the list;
 * - a section of an unknown type is dropped, and sections keep keys this
 *   schema does not list.
 *
 * `statistics.leaderboards` (every member's name and watch time) is part of
 * {@link wrappedStatisticsSchema}, because the v2 prompt reads it, but not of
 * the stored schema: parsing a stored row always drops it (RWP-01).
 *
 * @module lib/wrapped/data/schema-legacy
 */

import { z } from "zod"

/** A count or a number of minutes; anything else reads as 0. */
const count = z.number().nonnegative().catch(0)

/** An optional part that reads as absent when it is malformed. */
function part<T extends z.ZodType>(schema: T) {
  return schema.optional().catch(undefined)
}

/** An array whose items are checked one by one; items that fail are dropped. */
function itemsOf<T extends z.ZodType>(schema: T) {
  return z.array(z.unknown()).transform((items) =>
    items.flatMap((item): z.output<T>[] => {
      const parsed = schema.safeParse(item)
      return parsed.success ? [parsed.data] : []
    })
  )
}

const ratingKey = part(z.union([z.string().min(1), z.number().int().nonnegative()]).transform(String))

const movieSchema = z.object({
  title: z.string(),
  watchTime: count, // minutes
  playCount: count,
  year: part(z.coerce.number().int().positive()),
  rating: part(z.number()),
  ratingKey,
})

const showSchema = movieSchema.extend({ episodesWatched: count })

const monthSchema = z.object({
  month: z.number().int().min(1).max(12),
  monthName: z.string().catch(""),
  watchTime: count, // minutes
  topMovie: part(movieSchema.omit({ ratingKey: true })),
  topShow: part(showSchema.omit({ ratingKey: true })),
})

const leaderboardEntry = z.object({
  userId: z.string(),
  username: z.string(),
  friendlyName: z.string(),
  watchTime: z.number(),
  playCount: z.number(),
})

const topContentLeaderboardsSchema = z.object({
  movies: z.array(
    z.object({
      title: z.string(),
      ratingKey: z.string().optional(),
      leaderboard: z.array(leaderboardEntry),
      userPosition: z.number().optional(),
      totalWatchers: z.number(),
    })
  ),
  shows: z.array(
    z.object({
      title: z.string(),
      ratingKey: z.string().optional(),
      leaderboard: z.array(leaderboardEntry.extend({ episodesWatched: z.number() })),
      userPosition: z.number().optional(),
      totalWatchers: z.number(),
    })
  ),
})

const leaderboardsSchema = z.object({
  topContent: topContentLeaderboardsSchema,
  watchTime: z.object({
    leaderboard: z.array(
      z.object({
        userId: z.string(),
        username: z.string(),
        friendlyName: z.string(),
        totalWatchTime: z.number(),
        moviesWatchTime: z.number(),
        showsWatchTime: z.number(),
      })
    ),
    userPosition: z.number().optional(),
    totalUsers: z.number(),
  }),
})

const derivedStatisticsSchema = z.object({
  /** Longest run of consecutive calendar days with at least one play */
  longestStreak: z.object({ days: z.number(), start: z.string(), end: z.string() }).nullable(),
  /** Hour of day (0-23) with the most plays, with a friendly label */
  peakHour: z.object({ hour: z.number(), label: z.string(), plays: z.number() }).nullable(),
  /** Minutes watched per hour of day (24 buckets, index = hour) */
  hourHistogram: z.array(z.number()),
  /** Minutes watched per day of week, Sunday first */
  dayOfWeekHistogram: z.array(z.object({ day: z.string(), watchTime: z.number() })),
  /** Single calendar day with the most minutes watched */
  mostActiveDay: z.object({ date: z.string(), watchTime: z.number() }).nullable(),
  /** Share of watch time falling on Saturday/Sunday */
  weekendVsWeekday: z.object({ weekendPct: z.number() }),
})

const percentileResultSchema = z.object({
  /** 1-100, lower is better (1 = top of the leaderboard) */
  percentile: z.number(),
  /** Display label, e.g. "Top 5%" */
  topPercentLabel: z.string(),
})

const storedStatisticsSchema = z.object({
  totalWatchTime: z.object({ total: count, movies: count, shows: count }).catch({ total: 0, movies: 0, shows: 0 }),
  moviesWatched: count,
  showsWatched: count,
  episodesWatched: count,
  topMovies: itemsOf(movieSchema).catch([]),
  topShows: itemsOf(showSchema).catch([]),
  serverStats: part(
    z.object({
      serverName: z.string(),
      totalStorage: z.number(), // bytes
      totalStorageFormatted: z.string(), // e.g. "2.5 TB"
      librarySize: z.object({ movies: z.number(), shows: z.number(), episodes: z.number() }),
    })
  ),
  overseerrStats: part(
    z.object({
      totalRequests: count,
      totalServerRequests: count,
      approvedRequests: count,
      pendingRequests: count,
      availableRequests: part(z.number()), // available, or partially available for TV
      topRequestedGenres: itemsOf(z.object({ genre: z.string(), count: z.number() })).catch([]),
    })
  ),
  watchTimeByMonth: part(itemsOf(monthSchema)),
  /** v2; absent on Rewinds stored before the revamp */
  derived: part(derivedStatisticsSchema),
  /** v2; server watch-time percentile */
  percentile: part(percentileResultSchema),
  longestBinge: part(z.object({ title: z.string(), duration: z.number(), date: z.string() })),
  mostActiveDay: part(z.object({ day: z.string(), watchTime: z.number() })),
})

/** The statistics generation computes: the stored ones plus the leaderboards the prompt reads. */
const wrappedStatisticsSchema = storedStatisticsSchema.extend({ leaderboards: leaderboardsSchema.optional() })

const prominentStatSchema = z.object({
  value: z.union([z.number(), z.string()]),
  label: z.string(),
  description: z.string(),
})

/** Typed section payloads first; any other object is kept as a record. */
const sectionDataSchema = z.union([
  z.object({ prominentStat: prominentStatSchema }), // hero
  z.object({ movies: itemsOf(movieSchema) }), // top-movies
  z.object({ shows: itemsOf(showSchema) }), // top-shows
  z.object({ facts: itemsOf(z.string()) }), // fun-facts
  z.record(z.string(), z.unknown()),
])

const SECTION_TYPES = [
  // v1 + v2 sections
  "hero",
  "total-watch-time",
  "movies-breakdown",
  "shows-breakdown",
  "top-movies",
  "top-shows",
  "server-stats",
  "service-stats",
  "overseerr-stats",
  "insights",
  "fun-facts",
  // v2-only sections
  "streaks-patterns",
  "monthly-journey",
  "percentile",
  "archetype-reveal",
  "finale",
] as const

const sectionSchema = z.looseObject({
  id: z.string(),
  type: z.enum(SECTION_TYPES),
  title: z.string().catch(""),
  subtitle: part(z.string()),
  content: z.string().catch(""), // LLM-generated narrative text
  data: part(sectionDataSchema),
  animationDelay: part(z.number()), // v1 only; v2 pacing is owned by the viewer
})

const legacyFields = {
  /** Data format version; absent = v1 (pre-2026 revamp) */
  version: z.number().optional(),
  year: z.number().int().catch(0),
  userId: z.string().catch(""),
  userName: z.string().catch(""),
  generatedAt: z.string().catch(""),
  /** Viewer personality archetype (v2) */
  archetype: part(z.object({ id: z.string(), name: z.string(), tagline: z.string(), dedication: z.string() })),
  sections: itemsOf(sectionSchema).catch([]),
  /**
   * The four LLM-computed fields are only in rows generated before P2.9
   * (RWP-16); new v2 rows carry `funFacts` alone.
   */
  insights: z
    .object({
      personality: z.string().optional().catch(undefined),
      topGenre: z.string().optional().catch(undefined),
      bingeWatcher: z.boolean().optional().catch(undefined),
      discoveryScore: z.number().optional().catch(undefined), // 0-100
      funFacts: itemsOf(z.string()).catch([]),
    })
    .catch({ funFacts: [] }),
  /** Shareable summary for social sharing */
  summary: part(z.string()),
  metadata: z
    .object({ totalSections: count, generationTime: count /* seconds */ })
    .catch({ totalSections: 0, generationTime: 0 }),
}

const wrappedDataSchema = z.object({ ...legacyFields, statistics: wrappedStatisticsSchema })

/** A stored v1 or v2 row. Parsing drops `statistics.leaderboards`. */
export const storedWrappedDataSchema = z.object({
  ...legacyFields,
  statistics: storedStatisticsSchema.catch(() => storedStatisticsSchema.parse({})),
})

export type WrappedData = z.infer<typeof wrappedDataSchema>
export type StoredWrappedData = z.infer<typeof storedWrappedDataSchema>
export type WrappedStatistics = z.infer<typeof wrappedStatisticsSchema>
export type DerivedStatistics = z.infer<typeof derivedStatisticsSchema>
export type PercentileResult = z.infer<typeof percentileResultSchema>
export type MovieData = z.infer<typeof movieSchema>
export type ShowData = z.infer<typeof showSchema>
export type WrappedSection = z.infer<typeof sectionSchema>
export type WrappedSectionType = WrappedSection["type"]
