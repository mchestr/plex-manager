/**
 * One Radarr movie with its file, and the search that looks for a better
 * copy of it (docs/problem-reports.md, "Look for a better copy").
 *
 * `GET /api/v3/movie/{id}` carries the movie's `movieFile`, with Radarr's own
 * judgement of it against the quality profile (`qualityCutoffNotMet`,
 * `customFormatScore`). The search is `POST /api/v3/command {"name":
 * "MoviesSearch", "movieIds": [id]}`: with the file in place, Radarr grabs a
 * release only when its profile counts it as an upgrade, and removes nothing
 * until that copy imports.
 *
 * @module lib/connections/radarr-movie
 */

import "server-only"

import { z } from "zod"

import { arrPost, invalidArrParams } from "@/lib/connections/arr-client"
import { arrFileSchema, orNull } from "@/lib/connections/arr-upgrade"
import { serviceFetch, toConnectionResult } from "@/lib/connections/http"
import { type RadarrParsed } from "@/lib/validations/radarr"
import { type ConnectionResult } from "@/types/connection"

const positiveId = z.number().int().positive()

const movieSchema = z
  .looseObject({
    id: z.number().int(),
    monitored: z.boolean(),
    qualityProfileId: z.number().int(),
    path: orNull(z.string()),
    movieFile: orNull(arrFileSchema),
  })
  .transform(({ id, monitored, qualityProfileId, path, movieFile }) => ({ id, monitored, qualityProfileId, path, file: movieFile }))

/** A movie as a better copy reads it. */
export type RadarrMovieFile = z.infer<typeof movieSchema>

const commandSchema = z.looseObject({ id: z.number().int() }).transform(({ id }) => ({ id }))

export async function getRadarrMovieFile(config: RadarrParsed, movieId: number): Promise<ConnectionResult<RadarrMovieFile>> {
  if (!positiveId.safeParse(movieId).success) return invalidArrParams("Radarr")
  const result = await serviceFetch({ service: "Radarr", url: `${config.url}/api/v3/movie/${movieId}`, headers: { "X-Api-Key": config.apiKey }, schema: movieSchema })
  return toConnectionResult("Radarr", result)
}

/** Asks Radarr to search for the movie; the answer is the queued command's id. */
export async function startRadarrMovieSearch(config: RadarrParsed, movieId: number): Promise<ConnectionResult<{ id: number }>> {
  if (!positiveId.safeParse(movieId).success) return invalidArrParams("Radarr")
  return arrPost("Radarr", config, "/api/v3/command", { name: "MoviesSearch", movieIds: [movieId] }, commandSchema)
}
