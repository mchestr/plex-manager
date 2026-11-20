import "server-only"

import { z } from "zod"

import {
  arrDiskSchema,
  arrImportListSchema,
  arrRootFolderSchema,
  arrTagSchema,
  radarrMovieSchema,
  type ArrDisk,
  type ArrTag,
  type RadarrMovie,
} from "@/lib/cleanup/schema/upstream"
import { newTally, parseRows, runCall, tooManyInvalid, type CleanupReadOptions } from "@/lib/cleanup/snapshot/rows"
import { isTransientFailure, serviceFetch, withRetry, type ServiceErrorCode, type ServiceResult } from "@/lib/connections/http"

/**
 * The Radarr reads of media cleanup (TS 7.2.2 R1 to R5, TS 8.8 row 1), and
 * the v3 GET helpers that `./sonarr-library` shares.
 *
 * - `X-Api-Key` header, a Zod schema, the TS 7.2.2 timeout (the movie list
 *   60 s, every other call 10 s) and the caller's signal. Logs carry the host
 *   and the path only (`serviceFetch`).
 * - Reads retry transient failures (`withRetry`). Nothing here writes.
 * - The movie list parses row by row: above 1 % bad rows it fails with
 *   `ROWS_INVALID`. The small lists parse whole.
 * - A missing movie is the failure `{ code: "HTTP", status: 404 }`.
 *
 * @module lib/connections/radarr-library
 */

export interface ArrReadConfig {
  url: string
  apiKey: string
}

type ArrReadCode = ServiceErrorCode | "ROWS_INVALID" | "INVALID_KEY"
export type ArrReadResult<T> = ServiceResult<T, ArrReadCode>
type ArrService = "Radarr" | "Sonarr"

/** The list calls (R2, S2). */
export const ARR_LIST_TIMEOUT_MS = 60_000
/** Every other call of TS 7.2.2 and the re-reads of TS 8.8. */
export const ARR_TIMEOUT_MS = 10_000

/** `INVALID_KEY` for an id that is not a positive whole number. */
export const INVALID_ID = { ok: false, code: "INVALID_KEY" } as const

/** A Radarr or Sonarr record id: a positive whole number. */
export function isArrId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0
}

/** One GET of the v3 API, parsed with `schema`. */
export function arrRead<T>(
  service: ArrService,
  config: ArrReadConfig,
  path: string,
  schema: z.ZodType<T>,
  timeoutMs: number,
  opts: CleanupReadOptions
): Promise<ServiceResult<T>> {
  const once = () =>
    serviceFetch({
      service,
      url: `${config.url.replace(/\/+$/, "")}${path}`,
      headers: { "X-Api-Key": config.apiKey },
      schema,
      timeoutMs: opts.timeoutMs ?? timeoutMs,
      signal: opts.signal,
    })
  return runCall(opts, () => withRetry(once, { attempts: opts.attempts, signal: opts.signal, retryOn: isTransientFailure }))
}

/** One GET of a v3 list, with each record parsed on its own. */
export async function arrReadRows<T>(
  service: ArrService,
  config: ArrReadConfig,
  path: string,
  schema: z.ZodType<T>,
  timeoutMs: number,
  opts: CleanupReadOptions
): Promise<ArrReadResult<T[]>> {
  const result = await arrRead(service, config, path, z.array(z.unknown()), timeoutMs, opts)
  if (!result.ok) return result
  const tally = newTally()
  const rows = parseRows(`${service} ${path.split("?")[0]}`, schema, result.data, tally)
  return tooManyInvalid(tally) ? { ok: false, code: "ROWS_INVALID" } : { ok: true, data: rows }
}

/** R2: every movie, without the cover mapping (`excludeLocalCovers=true`). */
export function listRadarrMovies(config: ArrReadConfig, opts: CleanupReadOptions = {}): Promise<ArrReadResult<RadarrMovie[]>> {
  return arrReadRows("Radarr", config, "/api/v3/movie?excludeLocalCovers=true", radarrMovieSchema, ARR_LIST_TIMEOUT_MS, opts)
}

/** TS 8.8 row 1: one movie again, right before a deletion. */
export async function getRadarrMovie(config: ArrReadConfig, id: number, opts: CleanupReadOptions = {}): Promise<ArrReadResult<RadarrMovie>> {
  if (!isArrId(id)) return INVALID_ID
  return arrRead("Radarr", config, `/api/v3/movie/${id}`, radarrMovieSchema, ARR_TIMEOUT_MS, opts)
}

/** R3: the tags, for the label map. */
export function listRadarrTags(config: ArrReadConfig, opts: CleanupReadOptions = {}): Promise<ServiceResult<ArrTag[]>> {
  return arrRead("Radarr", config, "/api/v3/tag", arrTagSchema, ARR_TIMEOUT_MS, opts)
}

/** R4: the import lists, for the import-list tag set. */
export function listRadarrImportLists(config: ArrReadConfig, opts: CleanupReadOptions = {}): Promise<ServiceResult<{ tags: number[] }[]>> {
  return arrRead("Radarr", config, "/api/v3/importlist", arrImportListSchema, ARR_TIMEOUT_MS, opts)
}

/** R1: the root folders, for the path fence. */
export function listRadarrRootFolders(config: ArrReadConfig, opts: CleanupReadOptions = {}): Promise<ServiceResult<{ path: string }[]>> {
  return arrRead("Radarr", config, "/api/v3/rootfolder", arrRootFolderSchema, ARR_TIMEOUT_MS, opts)
}

/** R5: free and total space of each disk. */
export function getRadarrDisk(config: ArrReadConfig, opts: CleanupReadOptions = {}): Promise<ServiceResult<ArrDisk[]>> {
  return arrRead("Radarr", config, "/api/v3/diskspace", arrDiskSchema, ARR_TIMEOUT_MS, opts)
}
