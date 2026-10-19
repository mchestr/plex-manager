/**
 * Zod schemas for every upstream response the Rewind sources read (RWP-20).
 *
 * - Field names are the real ones: Tautulli's `play_duration`, never the
 *   nonexistent `viewed_duration`.
 * - Rows are `z.object`, so undeclared fields are stripped at parse time.
 *   `ip_address`, `player`, `machine_id` and email addresses are never
 *   declared, so they never get past the parser (NFR-7).
 * - A required field that is missing (a renamed field) fails the row. Tautulli
 *   sends `""` for an empty value, which reads as `null`.
 * - Pages are parsed loosely and their rows one by one with `parseRows`
 *   (`./rows.ts`), so one bad row costs that row, not the page.
 *
 * Tautulli's `{ response: { result, message, data } }` envelope is parsed by
 * `tautulliCommand`; the schemas here describe its `data`.
 *
 * @module lib/wrapped/sources/schemas
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

/* ---------------------------------------------------------------- Tautulli */

/** `get_history` data: a datatables page, or a flat array on some builds. */
export const tautulliHistoryDataSchema = z.union([
  z.array(z.unknown()),
  z.looseObject({ recordsFiltered: num, recordsTotal: num, data: z.array(z.unknown()) }),
])

/**
 * One `get_history` row (Tautulli 2.17, `grouping=1`). Times are Unix seconds.
 * `user_id` (the plex.tv account ID) buckets the server-wide pass by member;
 * it never reaches a `PlayEvent`.
 */
export const tautulliHistoryRowSchema = z.object({
  user_id: num,
  started: num,
  stopped: num,
  play_duration: num,
  paused_counter: num,
  percent_complete: num,
  watched_status: z.preprocess(numeric, z.number().min(0).max(1)),
  media_type: z.string(),
  rating_key: key,
  grandparent_rating_key: nullableKey,
  parent_media_index: nullableNum,
  media_index: nullableNum,
  title: z.string(),
  grandparent_title: nullableText,
  year: nullableNum,
  originally_available_at: nullableText,
  guid: nullableText,
  transcode_decision: nullableText,
  location: nullableText,
  platform: nullableText,
  product: nullableText,
  section_id: nullableKey,
  live: z.preprocess(numeric, z.union([z.literal(0), z.literal(1)])),
})
export type TautulliHistoryRow = z.infer<typeof tautulliHistoryRowSchema>

/** One `get_users` row: the ids and names only, never the email. */
export const tautulliUserSchema = z.object({ user_id: num, username: nullableText, friendly_name: nullableText })

/** One `get_libraries` row. @public (P2.6) */
export const tautulliLibrarySchema = z.object({ section_id: key, section_name: z.string(), section_type: z.string() })

/**
 * `get_metadata` data for one film or show, as the metadata cache reads it.
 * `duration` is in milliseconds; a show has no `media_info`. An unknown
 * rating key comes back as `{}`, which fails the parse.
 */
export const tautulliMetadataSchema = z.object({
  rating_key: key,
  media_type: z.string(),
  title: z.string(),
  year: nullableNum,
  content_rating: nullableText,
  section_id: nullableKey,
  added_at: nullableNum,
  originally_available_at: nullableText,
  genres: z.array(z.string()),
  directors: z.array(z.string()),
  actors: z.array(z.string()),
  studio: nullableText,
  guids: z.array(z.string()),
  duration: nullableNum.optional(),
  media_info: z
    .array(z.object({ video_full_resolution: nullableText.optional(), video_dynamic_range: nullableText.optional() }))
    .default([]),
})
export type TautulliMetadata = z.infer<typeof tautulliMetadataSchema>

/** `get_children_metadata` data: a show's seasons, or a season's episodes. */
export const tautulliChildrenSchema = z.object({
  children_count: num,
  children_list: z.array(z.object({ rating_key: key, media_index: nullableNum })).default([]),
})

/* --------------------------------------------------------------- Overseerr */

/**
 * `MediaRequest.status` (Overseerr's `server/constants/media.ts`, the same in
 * Jellyseerr and Seerr). Any other integer is neither pending nor approved.
 * @public
 */
export enum MediaRequestStatus {
  PENDING = 1,
  APPROVED = 2,
  DECLINED = 3,
  FAILED = 4,
  COMPLETED = 5,
}

/**
 * `Media.status`. Overseerr also sends 6 (deleted); Seerr sends 6
 * (blocklisted) and 7 (deleted). Neither is ever available.
 * @public
 */
export enum MediaStatus {
  UNKNOWN = 1,
  PENDING = 2,
  PROCESSING = 3,
  PARTIALLY_AVAILABLE = 4,
  AVAILABLE = 5,
}

const overseerrPageInfo = z.looseObject({ pages: num, page: num })

/** One page of `/api/v1/user?take=&skip=`: ids and Plex ids only. */
export const overseerrUserPageSchema = z.object({
  pageInfo: overseerrPageInfo,
  results: z.array(z.object({ id: num, plexId: z.number().int().nullish() })),
})

/** One page of `/api/v1/request`; each result is parsed with {@link overseerrRequestSchema}. */
export const overseerrRequestPageSchema = z.object({ pageInfo: overseerrPageInfo, results: z.array(z.unknown()) })

/** One request. */
export const overseerrRequestSchema = z.object({
  id: num,
  status: num,
  type: z.enum(["movie", "tv"]),
  is4k: z.boolean().optional(),
  createdAt: z.string(),
  requestedBy: z.object({ id: num }).nullable(),
  media: z.object({ status: num, status4k: num.optional(), tmdbId: num.nullish() }),
})
export type OverseerrRequestRow = z.infer<typeof overseerrRequestSchema>

/** `/api/v1/movie/{tmdbId}` or `/api/v1/tv/{tmdbId}`: the genres only. */
export const overseerrMediaDetailSchema = z.object({ genres: z.array(z.object({ name: z.string() })) })

/* -------------------------------------------------------------------- Plex */

/** `/library/sections`. */
export const plexSectionsSchema = z.object({
  MediaContainer: z.object({
    Directory: z.array(z.object({ key: key, type: z.string(), title: z.string() })).default([]),
  }),
})

/** One page of `/library/sections/{key}/all`; each item is parsed with {@link plexItemSchema}. */
export const plexItemsPageSchema = z.object({
  MediaContainer: z.object({ totalSize: num.optional(), size: num, Metadata: z.array(z.unknown()).default([]) }),
})

const tags = z.array(z.object({ tag: z.string() })).default([])

/** One library item, with the tags `includeGuids=1` adds. */
export const plexItemSchema = z.object({
  ratingKey: key,
  type: z.string(),
  title: z.string(),
  year: num.optional(),
  addedAt: num.optional(),
  contentRating: z.string().optional(),
  Genre: tags,
  Director: tags,
  Role: tags,
  Guid: z.array(z.object({ id: z.string() })).default([]),
})
export type PlexItemRow = z.infer<typeof plexItemSchema>

/* ------------------------------------------------------------------ Config */

/** `Config.rewindExcludedSectionIds`: section ids as numbers or strings; anything else is none. */
export const excludedSectionIdsSchema = z
  .array(key)
  .nullable()
  .catch(null)
  .transform((ids) => ids ?? [])

/**
 * `Config.rewindExcludedContentRatings`: rating strings such as `"TV-MA"`;
 * anything else is none.
 */
export const excludedContentRatingsSchema = z
  .array(z.string().trim().min(1))
  .nullable()
  .catch(null)
  .transform((ratings) => ratings ?? [])
