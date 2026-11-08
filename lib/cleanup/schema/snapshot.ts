/**
 * The stored library data (TS 3.4): source results, the items of one level
 * (`CleanupSnapshotPart.items`) and the server-wide facts
 * (`CleanupSnapshot.facts`). Client-safe.
 *
 * Every parse function never throws. A bad item or source row is dropped, and
 * `cleanup.parse_dropped` logs the issue paths only, never a value: the items
 * hold plex.tv account ids. Above 1 % dropped items, the loader treats the
 * part as failed (`cleanup.snapshot_rows_invalid`), so `parseSnapshotItems()`
 * returns the counts.
 *
 * @module lib/cleanup/schema/snapshot
 */

import { z } from "zod"

import { createLogger } from "@/lib/utils/logger"
import { LEVELS, SERVICES } from "@/lib/validations/cleanup-vocabulary"

const logger = createLogger("CLEANUP_PARSE")

export const SOURCE_STATES = ["ok", "failed", "notConfigured"] as const
export type SourceState = (typeof SOURCE_STATES)[number]

export const sourceStatusSchema = z.object({
  service: z.enum(SERVICES),
  state: z.enum(SOURCE_STATES),
  readAt: z.iso.datetime().nullable(),
  rows: z.number().int().nonnegative().optional(), // overseerr: requests read. tautulli: history rows read. radarr, sonarr: records. plex: items. The sourceShrank stop compares them (8.2)
  errorCode: z.string().max(40).optional(), // a ServiceErrorCode or a reader code, never a message
  part: z.enum(["server", "shares"]).optional(), // plex only: the server listing, or the plex.tv share list
})
export type SourceStatus = z.infer<typeof sourceStatusSchema>

const epoch = z.number().int().nonnegative() // Unix seconds
export const viewerSchema = z.object({
  user: z.string().regex(/^\d+$/), // plex.tv account id (Tautulli user_id)
  lastCountedAt: epoch.nullable(),
  lastCountedFinished: z.boolean(), // the viewer's newest counted play is finished
  counted: z.number().int().nonnegative(),
  finished: z.boolean(), // movie: any finished play. show, season: every episode on disk finished
  finishedEpisodes: z.number().int().nonnegative(), // show, season only (movie: 0)
})
export type Viewer = z.infer<typeof viewerSchema>

export const requestFactSchema = z.object({
  at: epoch, // createdAt
  by: z.string().regex(/^\d+$/).nullable(), // plex.tv account id; null when Overseerr has no Plex id for the user
  status: z.number().int(), // MediaRequestStatus; DECLINED (3) is dropped at read time
  is4k: z.boolean(),
  seasons: z.array(z.number().int().nonnegative()).nullable(), // tv only
})
export type RequestFact = z.infer<typeof requestFactSchema>

export const matchStateSchema = z.enum(["matched", "unmatched", "conflicted", "notManaged", "unknown"])
export type MatchState = z.infer<typeof matchStateSchema>
export const matchCauseSchema = z.enum([
  "noIds", "noArrRecord", "twoArrRecords", "conflictingIds", "outsideRoot", "outsideArrPath", "noPlexFile", "noSeasonNumber", "noArrSeason", "arrFailed",
  "seasonMismatch", // Plex and Sonarr number or fill the seasons of this show differently (7.4)
  "noArrFile", // Radarr or Sonarr has no file for it (hasFile false, or no episode file)
])
export type MatchCause = z.infer<typeof matchCauseSchema>

export const snapshotItemSchema = z.object({
  key: z.string(), // itemKey
  level: z.enum(LEVELS),
  titleKey: z.string(),
  title: z.string(), // movie or show title
  year: z.number().int().nullable(),
  seasonNumber: z.number().int().nullable(), // season items only
  showKey: z.string().nullable(), // season items: the show's itemKey
  sectionId: z.string(), // section of the managed copy (else the first copy)
  ratingKey: z.string(), // Plex rating key of the managed copy (else the first copy)
  copies: z.array(z.object({ ratingKey: z.string(), sectionId: z.string() })).min(1),
  episodeKeys: z.array(z.string()), // season and show items: Plex rating keys of episodes on disk (for marks). movie: []
  ids: z.object({ tmdb: z.number().int().optional(), tvdb: z.number().int().optional(), imdb: z.string().optional(), plex: z.string().optional() }),
  added: z.object({ plex: epoch.nullable(), arr: epoch.nullable() }),
  sizeBytes: z.number().int().nonnegative().nullable(),
  episodeCount: z.number().int().nonnegative().nullable(), // episodes on disk (show: without specials)
  match: z.object({ state: matchStateSchema, cause: matchCauseSchema.optional(), by: z.enum(["tmdb", "tvdb", "imdb"]).optional() }),
  arr: z.object({
    service: z.enum(["radarr", "sonarr"]), id: z.number().int(), titleSlug: z.string(), path: z.string(), root: z.string(),
    tags: z.array(z.string()), // tag labels, lower case
    importList: z.boolean(), // carries a tag of an import list
    monitored: z.boolean(),
    fileId: z.number().int().optional(), // radarr movieFileId when hasFile
    fileCount: z.number().int().nonnegative().optional(), // sonarr: episodes with a file at read time (show: seasons 1 and up; season: its own). A null statistics counts 0
  }).nullable(),
  show: z.object({ // show and season items
    status: z.enum(["continuing", "ended", "upcoming", "deleted"]).nullable(),
    seasonsOnDisk: z.number().int().nonnegative().nullable(),
    newestSeasonOnDisk: z.number().int().nullable(),
    lastEpisodeAddedAt: epoch.nullable(), // show: newest episode of the show. season: newest of the season
  }).nullable(),
  position: z.number().int().positive().nullable(), // season items: 1 = newest season on disk
  plays: z.object({ lastCountedAt: epoch.nullable(), countedAt: z.array(epoch), viewers: z.array(viewerSchema) }).nullable(), // null: Tautulli failed
  requests: z.array(requestFactSchema).nullable(), // null: Overseerr failed or not set up
  collections: z.array(z.string()), // titles of the Plex collections the snapshot read members of (G13)
  labels: z.array(z.string()), // Plex Label tags of the managed copy, lower case (movie, show). Seasons: []. For share filters (13.1)
})
export type SnapshotItem = z.infer<typeof snapshotItemSchema>

export const snapshotUserSchema = z.object({ hasAccess: z.boolean().nullable(), lastPlayAt: epoch.nullable(), owner: z.boolean() })
export type SnapshotUser = z.infer<typeof snapshotUserSchema>
export const ROW_COUNTERS = ["overseerrRequests", "tautulliRows", "usersWithPlay"] as const
export type RowCounter = (typeof ROW_COUNTERS)[number]

export const snapshotFactsSchema = z.object({
  version: z.literal(1),
  takenAt: z.iso.datetime(), // start of the first source read
  history: z.object({ startAt: epoch.nullable(), newestAt: epoch.nullable(), rows: z.number().int(), orphans: z.number().int(),
    usersWithPlay: z.number().int() }), // distinct plex.tv ids with a counted play (sourceShrank, 8.2)
  users: z.record(z.string().regex(/^\d+$/), snapshotUserSchema),
  libraries: z.array(z.object({
    sectionId: z.string(), title: z.string(), type: z.enum(["movie", "show"]), agent: z.string().nullable(), locations: z.array(z.string()),
    arr: z.enum(["radarr", "sonarr"]).nullable(), // a location overlaps a root folder of that arr
    noIds: z.boolean(), // agent com.plexapp.agents.none, or no item with an external id
    items: z.number().int(), seasons: z.number().int(), bytes: z.number().int(),
  })),
  disk: z.object({ freeBytes: z.number().int(), totalBytes: z.number().int() }).nullable(),
  growthBytesPerMonth: z.number().int().nullable(),
  collections: z.array(z.object({ sectionId: z.string(), ratingKey: z.string(), title: z.string(), childCount: z.number().int(), smart: z.boolean() })),
  membersRead: z.array(z.string()), // collection titles whose members were read (G13 and the seasonal suggestions)
  importListCount: z.object({ radarr: z.number().int(), sonarr: z.number().int() }),
  machineIdentifier: z.string().nullable(),
  labelsRead: z.array(z.string()), // section ids whose listing carried Label tags (13.1)
  rowBaseline: z.object({ overseerrRequests: z.number().int().optional(), tautulliRows: z.number().int().optional(),
    usersWithPlay: z.number().int().optional() }).default({}), // the counts the shrink check compares with (7.7, 8.2)
})
export type SnapshotFacts = z.infer<typeof snapshotFactsSchema>
export type SnapshotLibrary = SnapshotFacts["libraries"][number]

/** The issue paths of a failed parse, never a value. Shared by the cleanup schema files. */
export function issuePaths(error: z.ZodError, prefix: readonly (string | number)[] = []): string[] {
  return error.issues.map((issue) => [...prefix, ...issue.path].map(String).join(".") || "(root)")
}

/** Logs `cleanup.parse_dropped` with the stored document's name, the dropped count and at most 10 issue paths. */
export function logParseDropped(document: string, dropped: number, paths: readonly string[]): void {
  logger.warn("cleanup.parse_dropped", { document, dropped, paths: [...new Set(paths)].slice(0, 10) })
}

/** Parses an array row by row: the rows that pass, and how many were dropped. A value that is not an array drops as one row. */
export function parseStoredRows<T>(document: string, schema: z.ZodType<T>, raw: unknown): { rows: T[]; dropped: number; total: number } {
  const list: readonly unknown[] = Array.isArray(raw) ? raw : raw === undefined || raw === null ? [] : [raw]
  const rows: T[] = []
  const paths = new Set<string>() // the first 10 distinct paths are enough for the log
  for (const row of list) {
    const parsed = schema.safeParse(row)
    if (parsed.success) rows.push(parsed.data)
    else for (const path of issuePaths(parsed.error)) if (paths.size < 10) paths.add(path)
  }
  const dropped = list.length - rows.length
  if (dropped > 0) logParseDropped(document, dropped, [...paths])
  return { rows, dropped, total: list.length }
}

/** The items of one snapshot part. Never throws: bad rows are dropped and counted. */
export function parseSnapshotItems(raw: unknown): { items: SnapshotItem[]; dropped: number; total: number } {
  const { rows, dropped, total } = parseStoredRows("snapshotItems", snapshotItemSchema, raw)
  return { items: rows, dropped, total }
}

/** The facts of a snapshot, or null when they do not parse. Never throws. */
export function parseSnapshotFacts(raw: unknown): SnapshotFacts | null {
  const parsed = snapshotFactsSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  logParseDropped("snapshotFacts", 1, issuePaths(parsed.error))
  return null
}

/** The source results of a snapshot. Never throws: bad rows are dropped. */
export function parseSourceStatuses(raw: unknown): SourceStatus[] {
  return parseStoredRows("sources", sourceStatusSchema, raw).rows
}
