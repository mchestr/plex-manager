import "server-only"

import type { z } from "zod"

import {
  plexChildrenSchema, plexCollectionItemRow, plexCollectionRow, plexMetadataSchema, plexPageSchema, plexPartFiles, plexSectionSchema,
  type PlexCollectionItemRow, type PlexCollectionRow, type PlexMetadata, type PlexSection,
} from "@/lib/cleanup/schema/upstream"
import { MAX_PAGES, newTally, parseRows, runCall, tooManyInvalid, type CleanupReadOptions, type OnRows, type RowsFailureCode } from "@/lib/cleanup/snapshot/rows"
import { isTransientFailure, serviceFetch, withRetry, type ServiceErrorCode, type ServiceResult } from "@/lib/connections/http"

/**
 * The Plex library reads of media cleanup (TS 7.2.2 P1, P3 to P8, A1, and the
 * metadata read of TS 8.8 row 3).
 *
 * - Every call goes through `serviceFetch` with the token in `X-Plex-Token`,
 *   a Zod schema, the TS 7.2.2 timeout and the caller's signal. Logs carry
 *   the host and the path only.
 * - A rating key or section id that is not digits is refused with
 *   `INVALID_KEY` before any request (TS 7.2.1 item 8).
 * - Listings page with `X-Plex-Container-Start` and `X-Plex-Container-Size:
 *   500` until `totalSize`, read the signal between pages, and stop after 200
 *   pages with `PAGE_LIMIT`. Rows parse one by one: above 1 % bad rows the
 *   call fails with `ROWS_INVALID`.
 * - Reads retry transient failures (`withRetry`). Nothing here writes.
 *
 * @module lib/connections/plex-library-read
 */

export interface PlexReadConfig {
  url: string
  token: string
}

type PlexReadCode = ServiceErrorCode | RowsFailureCode | "INVALID_KEY"
export type PlexReadResult<T> = ServiceResult<T, PlexReadCode>

/** The listing `type` of each level (TS 7.2.2 P3 to P7). */
export const PLEX_TYPE = { movie: 1, show: 2, season: 3, episode: 4, collection: 18 } as const
export type PlexListType = (typeof PLEX_TYPE)[keyof typeof PLEX_TYPE]

/** What a paged listing read: the rows that parsed, and the pages. */
export interface PageCount {
  rows: number
  pages: number
}

const PAGE_SIZE = 500
const SECTIONS_TIMEOUT_MS = 15_000
const PAGE_TIMEOUT_MS = 30_000
const COLLECTION_TIMEOUT_MS = 15_000
const METADATA_TIMEOUT_MS = 10_000
const DIGITS = /^\d+$/

const INVALID_KEY = { ok: false, code: "INVALID_KEY" } as const
const ROWS_INVALID = { ok: false, code: "ROWS_INVALID" } as const

function plexGet<T>(
  config: PlexReadConfig,
  path: string,
  schema: z.ZodType<T>,
  timeoutMs: number,
  opts: CleanupReadOptions,
  headers: Record<string, string> = {}
): Promise<ServiceResult<T>> {
  const once = () =>
    serviceFetch({
      service: "Plex",
      url: `${config.url.replace(/\/+$/, "")}${path}`,
      headers: { "X-Plex-Token": config.token, ...headers },
      schema,
      timeoutMs: opts.timeoutMs ?? timeoutMs,
      signal: opts.signal,
    })
  return runCall(opts, () => withRetry(once, { attempts: opts.attempts, signal: opts.signal, retryOn: isTransientFailure }))
}

async function pageRows<T>(
  config: PlexReadConfig,
  path: string,
  schema: z.ZodType<T>,
  onRows: OnRows<T>,
  timeoutMs: number,
  opts: CleanupReadOptions
): Promise<PlexReadResult<PageCount>> {
  const tally = newTally()
  let start = 0
  let rows = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    if (opts.signal?.aborted) return { ok: false, code: "ABORTED" }
    const headers = { "X-Plex-Container-Start": String(start), "X-Plex-Container-Size": String(PAGE_SIZE) }
    const result = await plexGet(config, path, plexPageSchema, timeoutMs, opts, headers)
    if (!result.ok) return result

    const { Metadata, Directory, totalSize } = result.data.MediaContainer
    const raw = Metadata.length > 0 ? Metadata : Directory
    const parsed = parseRows(`plex ${path.split("?")[0]}`, schema, raw, tally)
    rows += parsed.length
    start += raw.length
    const stopped = (await onRows(parsed)) === false
    // Without a totalSize, a short page is the last one.
    const done = raw.length === 0 || (totalSize === undefined ? raw.length < PAGE_SIZE : start >= totalSize)
    if (stopped || done) return tooManyInvalid(tally) ? ROWS_INVALID : { ok: true, data: { rows, pages: page + 1 } }
  }
  return { ok: false, code: "PAGE_LIMIT" }
}

async function collect<T>(read: (onRows: OnRows<T>) => Promise<PlexReadResult<PageCount>>): Promise<PlexReadResult<T[]>> {
  const all: T[] = []
  const result = await read((rows) => {
    all.push(...rows)
  })
  return result.ok ? { ok: true, data: all } : result
}

/** P1: every library section, with its type, agent and folders. */
export async function listPlexSections(config: PlexReadConfig, opts: CleanupReadOptions = {}): Promise<PlexReadResult<PlexSection[]>> {
  const result = await plexGet(config, "/library/sections", plexPageSchema, SECTIONS_TIMEOUT_MS, opts)
  if (!result.ok) return result
  const tally = newTally()
  const sections = parseRows("plex sections", plexSectionSchema, result.data.MediaContainer.Directory, tally)
  return tooManyInvalid(tally) ? ROWS_INVALID : { ok: true, data: sections }
}

/**
 * P3 to P7: every row of one type in a section, a page of 500 at a time,
 * parsed with `schema` and handed to `onRows`. Movies and shows ask for
 * `includeGuids=1`. Collections (type 18) wait 15 s a page, the others 30 s.
 */
export async function forEachPlexRow<T>(
  config: PlexReadConfig,
  sectionId: string,
  type: PlexListType,
  schema: z.ZodType<T>,
  onRows: OnRows<T>,
  opts: CleanupReadOptions = {}
): Promise<PlexReadResult<PageCount>> {
  if (!DIGITS.test(sectionId)) return INVALID_KEY
  const guids = type === PLEX_TYPE.movie || type === PLEX_TYPE.show ? "&includeGuids=1" : ""
  const timeoutMs = type === PLEX_TYPE.collection ? COLLECTION_TIMEOUT_MS : PAGE_TIMEOUT_MS
  return pageRows(config, `/library/sections/${sectionId}/all?type=${type}${guids}`, schema, onRows, timeoutMs, opts)
}

/** P7: the collections of a section, smart ones included. */
export function listPlexCollections(
  config: PlexReadConfig,
  sectionId: string,
  opts: CleanupReadOptions = {}
): Promise<PlexReadResult<PlexCollectionRow[]>> {
  return collect((onRows) => forEachPlexRow(config, sectionId, PLEX_TYPE.collection, plexCollectionRow, onRows, opts))
}

/** P8: every member of a collection, a page of 500 at a time. */
export async function listPlexCollectionItems(
  config: PlexReadConfig,
  collectionId: string,
  opts: CleanupReadOptions = {}
): Promise<PlexReadResult<PlexCollectionItemRow[]>> {
  if (!DIGITS.test(collectionId)) return INVALID_KEY
  const path = `/library/collections/${collectionId}/items`
  return collect((onRows) => pageRows(config, path, plexCollectionItemRow, onRows, COLLECTION_TIMEOUT_MS, opts))
}

/**
 * One item (TS 8.8 row 3, A4): its type, section and files. A missing item
 * is the failure `{ code: "HTTP", status: 404 }`.
 */
export async function getPlexMetadata(
  config: PlexReadConfig,
  ratingKey: string,
  opts: CleanupReadOptions = {}
): Promise<PlexReadResult<PlexMetadata>> {
  if (!DIGITS.test(ratingKey)) return INVALID_KEY
  const result = await plexGet(config, `/library/metadata/${ratingKey}`, plexMetadataSchema, METADATA_TIMEOUT_MS, opts)
  return result.ok ? { ok: true, data: result.data.MediaContainer.Metadata[0] } : result
}

/**
 * A1: the set of `Part.file` paths of a season's episodes. Every episode row
 * must parse, so a dropped row never hides a file from the season file check
 * (TS 8.9). A missing season is `{ code: "HTTP", status: 404 }`.
 */
export async function listPlexSeasonFiles(
  config: PlexReadConfig,
  seasonRatingKey: string,
  opts: CleanupReadOptions = {}
): Promise<PlexReadResult<Set<string>>> {
  if (!DIGITS.test(seasonRatingKey)) return INVALID_KEY
  const result = await plexGet(config, `/library/metadata/${seasonRatingKey}/children`, plexChildrenSchema, METADATA_TIMEOUT_MS, opts)
  return result.ok ? { ok: true, data: new Set(result.data.MediaContainer.Metadata.flatMap(plexPartFiles)) } : result
}
