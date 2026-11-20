import "server-only"

import { z } from "zod"

import { serviceFetch, type ServiceErrorCode, type ServiceResult } from "@/lib/connections/http"

/**
 * The Radarr writes of Media cleanup (TS 8.9, the `movie.*` actions).
 *
 * Each function is one call, sent once: a write never goes through the retry
 * helper, because a write that timed out may still have been applied. The
 * act step decides what a failure means, with one re-read of the record.
 *
 * - Every call with a body sends `Content-Type: application/json`. Radarr's
 *   `[Consumes("application/json")]` routes answer 415 without it, and Node
 *   `fetch` sends a string body as `text/plain` (TS 7.2.1 item 7).
 * - Radarr answers its deletes with an empty 200 body, which a JSON read
 *   cannot parse, so every call reads the body as text (TS 7.2.1 item 5).
 * - Each call has a 60 s budget (TS 8.9 step 3).
 *
 * @module lib/connections/radarr-write
 */

interface RadarrWriteConfig {
  url: string
  apiKey: string
}

interface WriteOptions {
  signal?: AbortSignal
}

/** A transport failure, or `INVALID_ID` for an id refused before the request. */
type ArrWriteResult<T> = ServiceResult<T, ServiceErrorCode | "INVALID_ID">
/** A delete that found the record or file already gone (HTTP 404) gives `gone: true`. */
type ArrDeleteResult = ArrWriteResult<{ gone: boolean }>

/** The budget of each Radarr write (TS 8.9 step 3). */
const RADARR_WRITE_TIMEOUT_MS = 60_000

function isArrId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0
}

function invalidId(): { ok: false; code: "INVALID_ID" } {
  return { ok: false, code: "INVALID_ID" }
}

function radarrWrite(
  config: RadarrWriteConfig,
  method: "PUT" | "DELETE",
  path: string,
  body: unknown,
  { signal }: WriteOptions
): Promise<ServiceResult<string>> {
  const json: Record<string, string> = body === undefined ? {} : { "Content-Type": "application/json" }
  return serviceFetch({
    service: "Radarr",
    url: `${config.url}${path}`,
    method,
    headers: { "X-Api-Key": config.apiKey, ...json },
    body: body === undefined ? undefined : JSON.stringify(body),
    responseType: "text",
    schema: z.string(),
    timeoutMs: RADARR_WRITE_TIMEOUT_MS,
    signal,
  })
}

/** A 404 as `gone`, any other failure unchanged. */
function goneOn404(result: ServiceResult<string>): ArrDeleteResult {
  if (result.ok) return { ok: true, data: { gone: false } }
  if (result.code === "HTTP" && result.status === 404) return { ok: true, data: { gone: true } }
  return result
}

/**
 * Delete a movie and its files: `DELETE /api/v3/movie/{id}?deleteFiles=true&addImportExclusion={bool}`
 * (Radarr `MovieController.cs` lines 279 to 285). A gone movie answers 404
 * (`MovieService.cs` lines 213 to 220), which gives `gone: true`.
 *
 * @param options.importListExclusion - Add the movie to the import list exclusions, so a list cannot add it back.
 */
export async function deleteRadarrMovie(
  config: RadarrWriteConfig,
  id: number,
  options: WriteOptions & { importListExclusion: boolean }
): Promise<ArrDeleteResult> {
  if (!isArrId(id)) return invalidId()
  const query = `deleteFiles=true&addImportExclusion=${options.importListExclusion}`
  return goneOn404(await radarrWrite(config, "DELETE", `/api/v3/movie/${id}?${query}`, undefined, options))
}

/**
 * Stop Radarr from searching for a movie: `PUT /api/v3/movie/editor` with
 * `{"movieIds":[id],"monitored":false}` (`MovieEditorController.cs` line 48).
 * The editor changes only the fields it is sent.
 */
export async function unmonitorRadarrMovie(
  config: RadarrWriteConfig,
  id: number,
  options: WriteOptions = {}
): Promise<ArrWriteResult<null>> {
  if (!isArrId(id)) return invalidId()
  const result = await radarrWrite(config, "PUT", "/api/v3/movie/editor", { movieIds: [id], monitored: false }, options)
  return result.ok ? { ok: true, data: null } : result
}

/**
 * Delete one movie file and keep the movie: `DELETE /api/v3/moviefile/{id}`
 * (`MovieFileController.cs` lines 158 to 172). A gone file answers 404, which
 * gives `gone: true`.
 */
export async function deleteRadarrMovieFile(
  config: RadarrWriteConfig,
  movieFileId: number,
  options: WriteOptions = {}
): Promise<ArrDeleteResult> {
  if (!isArrId(movieFileId)) return invalidId()
  return goneOn404(await radarrWrite(config, "DELETE", `/api/v3/moviefile/${movieFileId}`, undefined, options))
}
