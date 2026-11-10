/**
 * The arr calls of each delete action (TS 8.9 step 3): every read and check
 * before the first write, and no retry. A failed write reads the record once:
 * a 404 is gone (Sonarr answers 500 for a gone series). Server-only;
 * `delete.ts` is its one caller, after the `deleting` write.
 *
 * | Action | Calls |
 * |---|---|
 * | `movie.delete` | `DELETE /movie/{id}` with the exclusion |
 * | `movie.unmonitorDeleteFiles` | unmonitor (a failure deletes nothing), re-read (no file: gone), `DELETE /moviefile/{id}` |
 * | `show.delete` | `DELETE /series/{id}` with the exclusion |
 * | `show.unmonitorDeleteFiles` | series, files (none: gone), `PUT` the series and every season unmonitored, bulk file deletes |
 * | `season.unmonitorDeleteFiles` | season number, series, files of the season (none: gone), files inside the series path, Plex season files equal (E22), episodes; then the season flag, the monitored episodes, bulk file deletes |
 *
 * A failed write after an unmonitor write that succeeded carries
 * `unmonitored: true`, so the row gets `arr.unmonitored`. So does an
 * unmonitor write that failed with no answer (`TIMEOUT`, `ABORTED`,
 * `NETWORK`): the app may have applied it. A file delete after no unmonitor
 * write (a season that was unmonitored already) carries none. Nothing
 * monitors the record again.
 *
 * WARNING: Never call Sonarr's season pass route, an Overseerr `DELETE`, a
 * Plex delete, or a bulk file delete with an empty list or two series.
 *
 * @module lib/cleanup/run/delete-actions
 */

import "server-only"

import { isInside } from "@/lib/cleanup/identity/path-fence"
import type { ActServices } from "@/lib/cleanup/run/pre-delete"
import type { ArrRef } from "@/lib/cleanup/schema/runtime"
import type { ServiceFailure } from "@/lib/connections/http"
import { listPlexSeasonFiles } from "@/lib/connections/plex-library-read"
import { getRadarrMovie } from "@/lib/connections/radarr-library"
import { deleteRadarrMovie, deleteRadarrMovieFile, unmonitorRadarrMovie } from "@/lib/connections/radarr-write"
import { getSonarrSeries, getSonarrSeriesFull, listSonarrEpisodeFiles, listSonarrEpisodes } from "@/lib/connections/sonarr-library"
import { deleteSonarrEpisodeFiles, deleteSonarrSeries, putSonarrSeries, unmonitorSonarrEpisodes } from "@/lib/connections/sonarr-write"
import type { CleanupItem } from "@/lib/generated/prisma/client"

type Endpoint = { url: string; apiKey: string }
/** What the calls found: done, gone, a season file mismatch (E22), no Plex season, or a failure. */
export type Action = { kind: "done" | "gone" | "mismatch" | "plexMissing" } | { kind: "fail"; code: string; status?: number; unmonitored?: boolean }
/** One call set: the arr endpoint, the `deleting` row, its arr record, the connections and the signal. */
export interface Calls { c: Endpoint; row: CleanupItem; arr: ArrRef; env: { services: ActServices; signal?: AbortSignal } }

const DONE: Action = { kind: "done" }
const GONE: Action = { kind: "gone" }
const is404 = (r: { ok: boolean; code?: string; status?: number }) => !r.ok && r.code === "HTTP" && r.status === 404
const fail = (r: ServiceFailure<string>, unmonitored = false): Action => ({ kind: "fail", code: r.code, ...(r.status ? { status: r.status } : {}), unmonitored })
const stop = (code: string): Action => ({ kind: "fail", code })
const signalOf = ({ env }: Calls) => ({ signal: env.signal })
/** A failed write with no answer may still have been applied (`radarr-write.ts`). */
const mayHaveApplied = (r: ServiceFailure<string>) => r.code === "TIMEOUT" || r.code === "ABORTED" || r.code === "NETWORK"

/** Step 6: a failed write reads the record once. A 404 is gone. */
async function goneOr(calls: Calls, failure: ServiceFailure<string>, unmonitored: boolean): Promise<Action> {
  const { c, arr } = calls
  const again = arr.service === "radarr" ? await getRadarrMovie(c, arr.id, signalOf(calls)) : await getSonarrSeries(c, arr.id, signalOf(calls))
  return is404(again) ? GONE : fail(failure, unmonitored)
}

/** Bulk deletes of one series' files, 50 a call. After a timeout, no file left means done. `unmonitored`: an unmonitor write came first. */
async function bulkDelete(calls: Calls, ids: number[], unmonitored: boolean): Promise<Action> {
  const result = await deleteSonarrEpisodeFiles(calls.c, ids, signalOf(calls))
  if (result.ok) return DONE
  if (result.code === "TIMEOUT") {
    const left = await listSonarrEpisodeFiles(calls.c, calls.arr.id, signalOf(calls))
    if (left.ok && !left.data.some((file) => ids.includes(file.id))) return DONE
  }
  return goneOr(calls, result, unmonitored)
}

async function movieDelete(calls: Calls): Promise<Action> {
  const result = await deleteRadarrMovie(calls.c, calls.arr.id, { importListExclusion: calls.row.importListExclusion, ...signalOf(calls) })
  return result.ok ? (result.data.gone ? GONE : DONE) : goneOr(calls, result, false)
}

async function movieUnmonitor(calls: Calls): Promise<Action> {
  const unmonitor = await unmonitorRadarrMovie(calls.c, calls.arr.id, signalOf(calls))
  if (!unmonitor.ok) return goneOr(calls, unmonitor, mayHaveApplied(unmonitor))
  const movie = await getRadarrMovie(calls.c, calls.arr.id, signalOf(calls))
  if (!movie.ok) return is404(movie) ? GONE : fail(movie, true)
  if (!movie.data.hasFile || !movie.data.movieFileId) return GONE
  const file = await deleteRadarrMovieFile(calls.c, movie.data.movieFileId, signalOf(calls))
  return file.ok ? (file.data.gone ? GONE : DONE) : fail(file, true)
}

async function showDelete(calls: Calls): Promise<Action> {
  const result = await deleteSonarrSeries(calls.c, calls.arr.id, { importListExclusion: calls.row.importListExclusion, ...signalOf(calls) })
  return result.ok ? DONE : goneOr(calls, result, false)
}

async function showUnmonitor(calls: Calls): Promise<Action> {
  const series = await getSonarrSeriesFull(calls.c, calls.arr.id, signalOf(calls))
  if (!series.ok) return is404(series) ? GONE : fail(series)
  const files = await listSonarrEpisodeFiles(calls.c, calls.arr.id, signalOf(calls))
  if (!files.ok) return fail(files)
  if (files.data.length === 0) return GONE
  const body = { ...series.data, monitored: false, seasons: series.data.seasons.map((season) => ({ ...season, monitored: false })) }
  const put = await putSonarrSeries(calls.c, body, signalOf(calls))
  return put.ok ? bulkDelete(calls, files.data.map((file) => file.id), true) : goneOr(calls, put, mayHaveApplied(put))
}

async function seasonUnmonitor(calls: Calls): Promise<Action> {
  const { c, row, arr, env } = calls
  const n = row.seasonNumber
  if (n === null || n < 1) return stop("noSeasonNumber")
  const series = await getSonarrSeriesFull(c, arr.id, signalOf(calls))
  if (!series.ok) return is404(series) ? GONE : fail(series)
  const season = series.data.seasons.find((s) => s.seasonNumber === n)
  if (!season) return stop("noArrSeason")
  const all = await listSonarrEpisodeFiles(c, arr.id, signalOf(calls))
  if (!all.ok) return fail(all)
  const files = all.data.filter((file) => file.seasonNumber === n)
  if (files.length === 0) return GONE
  if (!files.every((file) => isInside(file.path, series.data.path))) return stop("outsideArrPath")
  if (!env.services.plex) return stop("sourceFailed:plex")
  const plex = await listPlexSeasonFiles(env.services.plex, row.ratingKey, signalOf(calls))
  if (!plex.ok) return is404(plex) ? { kind: "plexMissing" } : stop("sourceFailed:plex")
  const paths = new Set(files.map((file) => file.path))
  if (paths.size !== plex.data.size || ![...paths].every((path) => plex.data.has(path))) return { kind: "mismatch" }
  const episodes = await listSonarrEpisodes(c, arr.id, n, signalOf(calls))
  if (!episodes.ok) return fail(episodes)
  let wrote = false
  if (season.monitored) {
    const body = { ...series.data, seasons: series.data.seasons.map((s) => (s.seasonNumber === n ? { ...s, monitored: false } : s)) }
    const put = await putSonarrSeries(c, body, signalOf(calls))
    if (!put.ok) return goneOr(calls, put, mayHaveApplied(put))
    wrote = true
  }
  const monitored = episodes.data.filter((episode) => episode.monitored).map((episode) => episode.id)
  const unmonitor = monitored.length > 0 ? await unmonitorSonarrEpisodes(c, monitored, signalOf(calls)) : null
  if (unmonitor && !unmonitor.ok) return fail(unmonitor, wrote || mayHaveApplied(unmonitor))
  return bulkDelete(calls, files.map((file) => file.id), wrote || monitored.length > 0)
}

/** The calls of each action id. */
export const ACTIONS: Record<string, (calls: Calls) => Promise<Action>> = { "movie.delete": movieDelete, "movie.unmonitorDeleteFiles": movieUnmonitor,
  "show.delete": showDelete, "show.unmonitorDeleteFiles": showUnmonitor, "season.unmonitorDeleteFiles": seasonUnmonitor }
