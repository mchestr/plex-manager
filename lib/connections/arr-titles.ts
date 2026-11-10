/**
 * Every movie in Radarr and every series in Sonarr, with what Fix the Plex
 * match compares: the ids, the title and year, the folder, and a movie's
 * file (docs/problem-reports.md, "Fix the Plex match"). The match check reads
 * them only when Plex's own ids don't lead to the file, to find the title the
 * file belongs to.
 *
 * | Call                       | Endpoint             |
 * |----------------------------|----------------------|
 * | {@link listRadarrMovieFiles}   | `GET /api/v3/movie`  |
 * | {@link listSonarrSeriesFolders} | `GET /api/v3/series` |
 *
 * A large library answers slowly, so each gets 30 seconds. A record that
 * fails its schema is skipped.
 *
 * @module lib/connections/arr-titles
 */

import "server-only"

import { z } from "zod"

import { arrFileSchema, orNull } from "@/lib/connections/arr-upgrade"
import { serviceFetch, toConnectionResult } from "@/lib/connections/http"
import { type ConnectionResult } from "@/types/connection"

type ArrConfig = { url: string; apiKey: string }

const LIBRARY_TIMEOUT_MS = 30_000

const movieSchema = z
  .looseObject({
    id: z.number().int(),
    tmdbId: z.number().int(),
    imdbId: orNull(z.string()),
    title: z.string(),
    year: orNull(z.number().int()),
    path: orNull(z.string()),
    movieFile: orNull(arrFileSchema),
  })
  .transform(({ id, tmdbId, imdbId, title, year, path, movieFile }) => ({ id, tmdbId, imdbId, title, year, path, file: movieFile }))

/** A Radarr movie, with its folder and file. */
export type RadarrMovieEntry = z.infer<typeof movieSchema>

const seriesSchema = z
  .looseObject({ id: z.number().int(), tvdbId: z.number().int(), title: z.string(), year: orNull(z.number().int()), path: orNull(z.string()) })
  .transform(({ id, tvdbId, title, year, path }) => ({ id, tvdbId, title, year, path }))

/** A Sonarr series, with its folder. */
export type SonarrSeriesEntry = z.infer<typeof seriesSchema>

async function readLibrary<T>(service: "Radarr" | "Sonarr", config: ArrConfig, path: string, schema: z.ZodType<T>): Promise<ConnectionResult<T[]>> {
  const result = await serviceFetch({ service, url: `${config.url}${path}`, headers: { "X-Api-Key": config.apiKey }, schema: z.array(z.unknown()), timeoutMs: LIBRARY_TIMEOUT_MS })
  if (!result.ok) return toConnectionResult(service, result)
  return {
    success: true,
    data: result.data.flatMap((record) => {
      const parsed = schema.safeParse(record)
      return parsed.success ? [parsed.data] : []
    }),
  }
}

export function listRadarrMovieFiles(config: ArrConfig): Promise<ConnectionResult<RadarrMovieEntry[]>> {
  return readLibrary("Radarr", config, "/api/v3/movie", movieSchema)
}

export function listSonarrSeriesFolders(config: ArrConfig): Promise<ConnectionResult<SonarrSeriesEntry[]>> {
  return readLibrary("Sonarr", config, "/api/v3/series", seriesSchema)
}
