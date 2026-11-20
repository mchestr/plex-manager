import "server-only"

import { z } from "zod"

import { serviceFetch, type ServiceErrorCode, type ServiceResult } from "@/lib/connections/http"

/**
 * The Sonarr writes of Media cleanup (TS 8.9, the `show.*` and `season.*`
 * actions).
 *
 * Each function sends its call once: a write never goes through the retry
 * helper. Every call with a body sends `Content-Type: application/json`,
 * because Sonarr's `[Consumes("application/json")]` routes answer 415
 * without it (TS 7.2.1 item 7). Bodies are read as text: the deletes answer
 * with an empty body (TS 7.2.1 item 5).
 *
 * WARNING: To unmonitor a season, send `putSonarrSeries` with the season flag
 * off and then {@link unmonitorSonarrEpisodes}. Never use Sonarr's season pass
 * route: it leaves the episodes monitored, and Sonarr downloads them again
 * (TS 8.9, R06 2.4).
 *
 * @module lib/connections/sonarr-write
 */

interface SonarrWriteConfig {
  url: string
  apiKey: string
}

interface WriteOptions {
  signal?: AbortSignal
}

/** A transport failure, or `INVALID_ID` for an id refused before the request. */
type ArrWriteResult<T> = ServiceResult<T, ServiceErrorCode | "INVALID_ID">

/**
 * A full series as Sonarr sent it (`getSonarrSeriesFull`, a loose object).
 * The PUT sends every field back unchanged: a strict type here would drop the
 * series settings it does not name (TS 8.9, deviation D10).
 */
type SonarrSeriesBody = { id: number } & Record<string, unknown>

/** The budget of a series or episode write (TS 8.9 step 3, TS 7.2.2 A3). */
const SONARR_WRITE_TIMEOUT_MS = 60_000
const SONARR_MONITOR_TIMEOUT_MS = 30_000
/** The bulk file delete: at most 50 ids per call, 300 s each (TS 8.9 step 3). */
const SONARR_FILE_BATCH = 50
const SONARR_BULK_DELETE_TIMEOUT_MS = 300_000

function isArrId(id: number): boolean {
  return Number.isSafeInteger(id) && id > 0
}

function invalidId(): { ok: false; code: "INVALID_ID" } {
  return { ok: false, code: "INVALID_ID" }
}

async function sonarrWrite(
  config: SonarrWriteConfig,
  method: "PUT" | "DELETE",
  path: string,
  { body, timeoutMs = SONARR_WRITE_TIMEOUT_MS, signal }: WriteOptions & { body?: unknown; timeoutMs?: number }
): Promise<ArrWriteResult<null>> {
  const json: Record<string, string> = body === undefined ? {} : { "Content-Type": "application/json" }
  const result = await serviceFetch({
    service: "Sonarr",
    url: `${config.url}${path}`,
    method,
    headers: { "X-Api-Key": config.apiKey, ...json },
    body: body === undefined ? undefined : JSON.stringify(body),
    responseType: "text",
    schema: z.string(),
    timeoutMs,
    signal,
  })
  return result.ok ? { ok: true, data: null } : result
}

/**
 * Save a series: `PUT /api/v3/series/{id}` with the whole body, which Sonarr
 * answers with 202 (`SeriesController.cs` lines 191 to 205).
 */
export async function putSonarrSeries(
  config: SonarrWriteConfig,
  body: SonarrSeriesBody,
  options: WriteOptions = {}
): Promise<ArrWriteResult<null>> {
  if (!isArrId(body.id)) return invalidId()
  return sonarrWrite(config, "PUT", `/api/v3/series/${body.id}`, { ...options, body })
}

/**
 * Delete a series and its files: `DELETE /api/v3/series/{id}?deleteFiles=true&addImportListExclusion={bool}`
 * (`SeriesController.cs` lines 210 to 214). A gone series answers 500, not
 * 404, so the caller reads the series again to tell (TS 8.9 step 6).
 */
export async function deleteSonarrSeries(
  config: SonarrWriteConfig,
  id: number,
  options: WriteOptions & { importListExclusion: boolean }
): Promise<ArrWriteResult<null>> {
  if (!isArrId(id)) return invalidId()
  const query = `deleteFiles=true&addImportListExclusion=${options.importListExclusion}`
  return sonarrWrite(config, "DELETE", `/api/v3/series/${id}?${query}`, { signal: options.signal })
}

/**
 * Stop Sonarr from grabbing episodes: `PUT /api/v3/episode/monitor` with
 * `{"episodeIds":[...],"monitored":false}` (`EpisodeController.cs` lines 62
 * to 78, TS 7.2.2 A3). An empty list sends nothing.
 */
export async function unmonitorSonarrEpisodes(
  config: SonarrWriteConfig,
  episodeIds: readonly number[],
  options: WriteOptions = {}
): Promise<ArrWriteResult<null>> {
  if (!episodeIds.every(isArrId)) return invalidId()
  if (episodeIds.length === 0) return { ok: true, data: null }
  const body = { episodeIds: [...new Set(episodeIds)], monitored: false }
  return sonarrWrite(config, "PUT", "/api/v3/episode/monitor", { ...options, body, timeoutMs: SONARR_MONITOR_TIMEOUT_MS })
}

/**
 * Delete episode files of one series: `DELETE /api/v3/episodefile/bulk` with
 * `{"episodeFileIds":[...]}`, at most 50 ids per call (`EpisodeFileController.cs`
 * lines 167 to 180). It stops at the first failed call. The calls before it
 * have deleted their files, so on a failure the caller reads the files again.
 *
 * WARNING: The controller reads the series of the first file and fails on an
 * empty list, so this throws before any request when `episodeFileIds` is
 * empty. Never pass the files of two series (TS 8.9).
 *
 * @throws Error when `episodeFileIds` is empty.
 */
export async function deleteSonarrEpisodeFiles(
  config: SonarrWriteConfig,
  episodeFileIds: readonly number[],
  options: WriteOptions = {}
): Promise<ArrWriteResult<{ deleted: number }>> {
  if (episodeFileIds.length === 0) throw new Error("deleteSonarrEpisodeFiles needs at least one episode file id")
  if (!episodeFileIds.every(isArrId)) return invalidId()
  const ids = [...new Set(episodeFileIds)]
  for (let start = 0; start < ids.length; start += SONARR_FILE_BATCH) {
    const body = { episodeFileIds: ids.slice(start, start + SONARR_FILE_BATCH) }
    const result = await sonarrWrite(config, "DELETE", "/api/v3/episodefile/bulk", {
      ...options,
      body,
      timeoutMs: SONARR_BULK_DELETE_TIMEOUT_MS,
    })
    if (!result.ok) return result
  }
  return { ok: true, data: { deleted: ids.length } }
}
