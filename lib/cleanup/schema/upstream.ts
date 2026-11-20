/**
 * Zod projections of every upstream answer that media cleanup reads (TS 7.2.3).
 *
 * - Rows are `z.object`, so undeclared fields drop at parse time. Names,
 *   emails and IP addresses are never declared, so they never pass.
 * - Number-like strings parse with `num` and `key` (copied from
 *   `lib/wrapped/sources/schemas.ts`). Tautulli sends `""` for an empty value,
 *   which reads as `null`.
 * - Pages parse loosely, and each row parses on its own with `parseRows`
 *   (`lib/cleanup/snapshot/rows.ts`), so one bad row costs that row.
 * - `sonarrSeriesFullSchema` is the one loose row: the series `PUT` of TS 8.9
 *   sends the body back unchanged, and a strict schema would erase settings.
 * - Unknown Sonarr statuses parse as `deleted`, which never matches a
 *   `show.status` condition (TS 4.3).
 *
 * Pure: no server import, so the snapshot assembly and its tests use it too.
 *
 * @module lib/cleanup/schema/upstream
 */

import { z } from "zod"

const NUMERIC = /^-?\d+(\.\d+)?$/
const blankToNull = (v: unknown) => (v === "" ? null : v)
const numeric = (v: unknown) => (typeof v === "string" && NUMERIC.test(v) ? Number(v) : v)
const keyText = (v: unknown) => (typeof v === "number" ? String(v) : v)

const num = z.preprocess(numeric, z.number())
const nullableNum = z.preprocess((v) => numeric(blankToNull(v)), z.number().nullable())
const nullableText = z.preprocess(blankToNull, z.string().nullable())
const key = z.preprocess(keyText, z.string().regex(/^\d+$/))
const nullableKey = z.preprocess((v) => keyText(blankToNull(v)), z.string().regex(/^\d+$/).nullable())
const int = z.number().int()

/* -------------------------------------------------------------------- Plex */

const part = z.object({ file: z.string(), size: num.optional() })
const media = z.object({ Part: z.array(part).default([]) })
const guidTags = z.array(z.object({ id: z.string() })).default([])
/** [V] the section listing carries the Label tags (TS 16.10 check 11). */
const labelTags = z.array(z.object({ tag: z.string() })).default([])

export const plexSectionSchema = z.object({
  key,
  type: z.string(),
  title: z.string(),
  agent: z.string().optional(),
  Location: z.array(z.object({ path: z.string() })).default([]),
})
export const plexMovieRow = z.object({
  ratingKey: key, title: z.string(), year: num.optional(), addedAt: num.optional(),
  guid: z.string().optional(), Guid: guidTags, Label: labelTags, Media: z.array(media).default([]),
})
export const plexShowRow = z.object({
  ratingKey: key, title: z.string(), year: num.optional(), addedAt: num.optional(),
  guid: z.string().optional(), Guid: guidTags, Label: labelTags,
})
export const plexSeasonRow = z.object({ ratingKey: key, parentRatingKey: key, index: num.optional(), addedAt: num.optional() })
export const plexEpisodeRow = z.object({
  ratingKey: key, parentRatingKey: key, grandparentRatingKey: key, index: num.optional(),
  parentIndex: num.optional(), guid: z.string().optional(), addedAt: num.optional(), Media: z.array(media).default([]),
})
export const plexCollectionRow = z.object({
  ratingKey: key, title: z.string(), childCount: num.optional(), smart: z.union([z.boolean(), num]).optional(),
})
/** One member of a collection (P8): the key the snapshot matches to a copy, season or show. */
export const plexCollectionItemRow = z.object({ ratingKey: key, type: z.string().optional() })
/** A section listing page (P3 to P8). Rows parse one by one. */
export const plexPageSchema = z.object({
  MediaContainer: z.object({
    totalSize: num.optional(), size: num.optional(),
    Metadata: z.array(z.unknown()).default([]), Directory: z.array(z.unknown()).default([]),
  }),
})
/** `GET /library/metadata/{ratingKey}` (TS 8.8 row 3, A4): the item and its files. */
export const plexMetadataSchema = z.object({
  MediaContainer: z.object({
    Metadata: z.array(z.object({
      ratingKey: key, type: z.string(), title: z.string().optional(), librarySectionID: key.optional(),
      smart: z.union([z.boolean(), num]).optional(), Media: z.array(media).default([]),
    })).min(1),
  }),
})
/** `GET /library/metadata/{seasonRatingKey}/children` (A1): every episode with its files. */
export const plexChildrenSchema = z.object({
  MediaContainer: z.object({ Metadata: z.array(z.object({ ratingKey: key, Media: z.array(media).default([]) })).default([]) }),
})
/** Any id form: a session of Live TV or of another server can carry a key that is not digits. */
const sessionKey = z.union([z.string(), z.number()]).transform(String).optional()
/** `GET /status/sessions` (TS 8.8 row 7): only the keys of what plays. */
export const plexSessionsSchema = z.object({
  MediaContainer: z.object({
    Metadata: z.array(z.object({ ratingKey: sessionKey, parentRatingKey: sessionKey, grandparentRatingKey: sessionKey })).default([]),
  }),
})

/* ---------------------------------------------------------------- Tautulli */

/** One `get_history` row (T1, `grouping=1`). Times are Unix seconds. */
export const historyRowSchema = z.object({
  row_id: nullableKey, reference_id: nullableKey, user_id: num, started: num, stopped: num,
  play_duration: num, percent_complete: num, watched_status: z.preprocess(numeric, z.number().min(0).max(1)),
  media_type: z.string(), rating_key: key, parent_rating_key: nullableKey, grandparent_rating_key: nullableKey,
  guid: nullableText, live: z.preprocess(numeric, z.union([z.literal(0), z.literal(1)])),
})
/**
 * A row of the pre-delete read (`include_activity=1`, TS 8.8 row 4). A live
 * session row has `row_id: null`, and its `stopped` is null until it stops.
 */
export const recentHistoryRowSchema = historyRowSchema.extend({ stopped: nullableNum })
/** `get_history` data: a datatables page, or a flat array on some builds. */
export const historyPageSchema = z.union([
  z.array(z.unknown()),
  z.looseObject({ recordsFiltered: num, data: z.array(z.unknown()) }),
])

/* --------------------------------------------------------------- Overseerr */

export const seerrRequestSchema = z.object({
  id: num, status: num, type: z.enum(["movie", "tv"]), is4k: z.boolean().optional(), createdAt: z.string(),
  requestedBy: z.object({ id: num }).nullable(),
  media: z.object({ tmdbId: num.nullish(), tvdbId: num.nullish() }),
  seasons: z.array(z.object({ seasonNumber: num })).optional(),
})
export const seerrRequestPageSchema = z.object({
  pageInfo: z.looseObject({ pages: num, page: num }),
  results: z.array(z.unknown()),
})

/* ----------------------------------------------------------- Radarr, Sonarr */

/** A Radarr movie, from the list (R2) and the re-read (TS 8.8 row 1). */
export const radarrMovieSchema = z.object({
  id: int, title: z.string(), year: int.optional(), titleSlug: z.string(),
  tmdbId: int, imdbId: z.string().nullish(), path: z.string(), rootFolderPath: z.string().nullish(),
  monitored: z.boolean(), hasFile: z.boolean().nullish(), movieFileId: int.optional(),
  sizeOnDisk: z.number().nullish(), statistics: z.object({ sizeOnDisk: z.number().nullish() }).nullish(),
  added: z.string(), tags: z.array(int).default([]), status: z.string().optional(),
})

const seasonSchema = z.object({
  seasonNumber: int, monitored: z.boolean(),
  statistics: z.object({ episodeFileCount: int, sizeOnDisk: z.number() }).nullish(),
})
/** A Sonarr series, from the list (S2) and the re-read (TS 8.8 rows 1 and 2). */
export const sonarrSeriesSchema = z.object({
  id: int, title: z.string(), year: int.optional(), titleSlug: z.string(),
  tvdbId: int, tmdbId: int.nullish(), imdbId: z.string().nullish(),
  path: z.string(), status: z.enum(["continuing", "ended", "upcoming", "deleted"]).catch("deleted"),
  monitored: z.boolean(), added: z.string(), tags: z.array(int).default([]),
  seasons: z.array(seasonSchema).default([]),
  statistics: z.object({ sizeOnDisk: z.number(), episodeFileCount: int }).nullish(),
})
/** The whole series body for the `PUT` of TS 8.9: unknown fields stay. */
export const sonarrSeriesFullSchema = z.looseObject({
  id: int, path: z.string(), monitored: z.boolean(),
  seasons: z.array(z.looseObject({ seasonNumber: int, monitored: z.boolean() })),
})
/** `GET /api/v3/episodefile?seriesId=` (TS 8.9). */
export const sonarrEpisodeFileSchema = z.object({ id: int, seriesId: int, seasonNumber: int, path: z.string(), size: z.number().optional() })
/** `GET /api/v3/episode?seriesId=&seasonNumber=` (A2). */
export const sonarrEpisodeSchema = z.object({
  id: int, seriesId: int, seasonNumber: int, episodeNumber: int,
  episodeFileId: int.optional(), hasFile: z.boolean(), monitored: z.boolean(),
})

export const arrRootFolderSchema = z.array(z.object({ path: z.string() }))
export const arrTagSchema = z.array(z.object({ id: int, label: z.string() }))
export const arrImportListSchema = z.array(z.object({ tags: z.array(int).default([]) }))
export const arrDiskSchema = z.array(z.object({ path: z.string(), freeSpace: z.number(), totalSpace: z.number() }))

export type PlexSection = z.infer<typeof plexSectionSchema>
export type PlexMovieRow = z.infer<typeof plexMovieRow>
export type PlexShowRow = z.infer<typeof plexShowRow>
export type PlexSeasonRow = z.infer<typeof plexSeasonRow>
export type PlexEpisodeRow = z.infer<typeof plexEpisodeRow>
export type PlexCollectionRow = z.infer<typeof plexCollectionRow>
export type PlexCollectionItemRow = z.infer<typeof plexCollectionItemRow>
export type PlexMetadata = z.infer<typeof plexMetadataSchema>["MediaContainer"]["Metadata"][number]
export type HistoryRow = z.infer<typeof historyRowSchema>
export type RecentHistoryRow = z.infer<typeof recentHistoryRowSchema>
export type SeerrRequest = z.infer<typeof seerrRequestSchema>
export type RadarrMovie = z.infer<typeof radarrMovieSchema>
export type SonarrSeries = z.infer<typeof sonarrSeriesSchema>
export type SonarrSeriesFull = z.infer<typeof sonarrSeriesFullSchema>
export type SonarrEpisodeFile = z.infer<typeof sonarrEpisodeFileSchema>
export type SonarrEpisode = z.infer<typeof sonarrEpisodeSchema>
export type ArrTag = z.infer<typeof arrTagSchema>[number]
export type ArrDisk = z.infer<typeof arrDiskSchema>[number]

/** Every `Part.file` of a Plex item, in order. */
export function plexPartFiles(item: { Media: { Part: { file: string }[] }[] }): string[] {
  return item.Media.flatMap((copy) => copy.Part.map((p) => p.file))
}

/**
 * Sonarr's episode file count: season `seasonNumber`, or every season from 1
 * up. A season whose `statistics` is null counts 0, in the snapshot and in the
 * pre-delete re-read alike (TS 8.8 row 2, integrations-r3-4).
 */
export function sonarrFileCount(series: Pick<SonarrSeries, "seasons">, seasonNumber?: number): number {
  return series.seasons
    .filter((season) => (seasonNumber === undefined ? season.seasonNumber >= 1 : season.seasonNumber === seasonNumber))
    .reduce((sum, season) => sum + (season.statistics?.episodeFileCount ?? 0), 0)
}
