/**
 * Every call the problem report fixes make that changes something in Radarr
 * or Sonarr (docs/problem-reports.md, "Fixes"). Each is a typed call on ids
 * the app parsed from Radarr's or Sonarr's own responses; the request helper
 * stays private, so nothing else can send an arbitrary write.
 *
 * | Call                      | Request                                                    |
 * |---------------------------|------------------------------------------------------------|
 * | {@link startRadarrMovieSearch} | `POST /api/v3/command {"name": "MoviesSearch", "movieIds": [id]}` |
 * | {@link searchSonarrEpisodes}   | `POST /api/v3/command {"name": "EpisodeSearch", "episodeIds": [...]}` |
 * | {@link grabArrRelease}         | `POST /api/v3/release {guid, indexerId}`, from the last interactive search |
 * | {@link failArrGrab}            | `POST /api/v3/history/failed/{id}`, which blocklists the grab's release |
 * | {@link deleteArrFile}          | `DELETE /api/v3/moviefile/{id}` or `/api/v3/episodefile/{id}` |
 * | {@link monitorRadarrMovie}     | `PUT /api/v3/movie/editor {"movieIds": [id], "monitored": true}` |
 * | {@link monitorSonarrEpisodes}  | `PUT /api/v3/episode/monitor {"episodeIds": [...], "monitored": true}` |
 *
 * A search with a file in place grabs only an upgrade its quality profile
 * wants, and removes nothing until that copy imports.
 *
 * @module lib/connections/arr-writes
 */

import "server-only"

import { z } from "zod"

import { invalidArrParams } from "@/lib/connections/arr-client"
import { serviceFetch, toConnectionResult, type ServiceResult } from "@/lib/connections/http"
import { type ConnectionResult } from "@/types/connection"

type ArrService = "Radarr" | "Sonarr"
type ArrConfig = { url: string; apiKey: string }

const isId = (id: number) => Number.isInteger(id) && id > 0
const commandSchema = z.looseObject({ id: z.number().int() }).transform(({ id }) => ({ id }))

/** Sends one write; a body of `null` sends none. A response body is read as text, since some writes answer with none. */
function send(service: ArrService, config: ArrConfig, method: "POST" | "PUT" | "DELETE", path: string, body: unknown): Promise<ServiceResult<string>> {
  return serviceFetch({
    service,
    url: `${config.url}${path}`,
    method,
    headers: { "X-Api-Key": config.apiKey, ...(body === null ? {} : { "Content-Type": "application/json" }) },
    body: body === null ? undefined : JSON.stringify(body),
    responseType: "text",
    schema: z.string(),
  })
}

/** A command's id from its JSON answer. */
async function command(service: ArrService, config: ArrConfig, body: object): Promise<ConnectionResult<{ id: number }>> {
  const result = await send(service, config, "POST", "/api/v3/command", body)
  if (!result.ok) return toConnectionResult(service, result)
  let parsed: unknown
  try {
    parsed = JSON.parse(result.data)
  } catch {
    parsed = null
  }
  const answer = commandSchema.safeParse(parsed)
  return answer.success ? { success: true, data: answer.data } : { success: false, error: `${service} answered the command in a way the app can't read` }
}

const done = (service: ArrService, result: ServiceResult<string>): ConnectionResult<null> => (result.ok ? { success: true, data: null } : toConnectionResult(service, result))

/** Asks Radarr to search for the movie; the answer is the queued command's id. */
export async function startRadarrMovieSearch(config: ArrConfig, movieId: number): Promise<ConnectionResult<{ id: number }>> {
  if (!isId(movieId)) return invalidArrParams("Radarr")
  return command("Radarr", config, { name: "MoviesSearch", movieIds: [movieId] })
}

/** Asks Sonarr to search for exactly these episodes; the answer is the queued command's id. */
export async function searchSonarrEpisodes(config: ArrConfig, episodeIds: readonly number[]): Promise<ConnectionResult<{ id: number }>> {
  if (episodeIds.length === 0 || !episodeIds.every(isId)) return invalidArrParams("Sonarr")
  return command("Sonarr", config, { name: "EpisodeSearch", episodeIds })
}

/** Grabs a release the last interactive search returned, which Radarr and Sonarr keep for 30 minutes. */
export async function grabArrRelease(service: ArrService, config: ArrConfig, release: { guid: string; indexerId: number }): Promise<ConnectionResult<null>> {
  if (!release.guid || !Number.isInteger(release.indexerId) || release.indexerId < 0) return invalidArrParams(service)
  return done(service, await send(service, config, "POST", "/api/v3/release", { guid: release.guid, indexerId: release.indexerId }))
}

/** Marks a grab failed: its release is blocklisted, so neither grabs it again. */
export async function failArrGrab(service: ArrService, config: ArrConfig, historyId: number): Promise<ConnectionResult<null>> {
  if (!isId(historyId)) return invalidArrParams(service)
  return done(service, await send(service, config, "POST", `/api/v3/history/failed/${historyId}`, null))
}

/**
 * Deletes a movie's or an episode's file. `conflict` is Radarr's or Sonarr's
 * 409, which they answer when the file's root folder is missing: nothing was
 * deleted, and trying again won't help.
 */
export async function deleteArrFile(service: ArrService, config: ArrConfig, fileId: number): Promise<ConnectionResult<null> | { success: false; conflict: true; error: string }> {
  if (!isId(fileId)) return invalidArrParams(service)
  const path = service === "Radarr" ? `/api/v3/moviefile/${fileId}` : `/api/v3/episodefile/${fileId}`
  const result = await send(service, config, "DELETE", path, null)
  if (!result.ok && result.code === "HTTP" && result.status === 409) return { success: false, conflict: true, error: `${service} couldn't delete the file: its root folder is missing` }
  return done(service, result)
}

/** Monitors the movie again, as a removal needs when Radarr unmonitors deleted movies. */
export async function monitorRadarrMovie(config: ArrConfig, movieId: number): Promise<ConnectionResult<null>> {
  if (!isId(movieId)) return invalidArrParams("Radarr")
  return done("Radarr", await send("Radarr", config, "PUT", "/api/v3/movie/editor", { movieIds: [movieId], monitored: true }))
}

/** Monitors the episodes again, as a removal needs when Sonarr unmonitors deleted episodes. */
export async function monitorSonarrEpisodes(config: ArrConfig, episodeIds: readonly number[]): Promise<ConnectionResult<null>> {
  if (episodeIds.length === 0 || !episodeIds.every(isId)) return invalidArrParams("Sonarr")
  return done("Sonarr", await send("Sonarr", config, "PUT", "/api/v3/episode/monitor", { episodeIds, monitored: true }))
}
