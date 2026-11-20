/**
 * A Sonarr series' monitoring and quality profile, its episodes and episode
 * files, for the problem report fixes (docs/problem-reports.md).
 *
 * `GET /api/v3/series/{id}` reads the series, and `GET /api/v3/episode?seriesId=`
 * and `GET /api/v3/episodefile?seriesId=` list the rest; a record that fails
 * its schema is skipped. The search for episodes is in `./arr-writes`.
 *
 * @module lib/connections/sonarr-episodes
 */

import "server-only"

import { z } from "zod"

import { arrList, arrQuery, invalidArrParams } from "@/lib/connections/arr-client"
import { arrFileSchema, orNull, type ArrFile } from "@/lib/connections/arr-upgrade"
import { serviceFetch, toConnectionResult } from "@/lib/connections/http"
import { type SonarrParsed } from "@/lib/validations/sonarr"
import { type ConnectionResult } from "@/types/connection"

const positiveId = z.number().int().positive()
const seriesIdParams = z.strictObject({ seriesId: positiveId })

const seriesSchema = z
  .looseObject({ id: z.number().int(), monitored: z.boolean(), qualityProfileId: z.number().int() })
  .transform(({ id, monitored, qualityProfileId }) => ({ id, monitored, qualityProfileId }))

const episodeSchema = z.looseObject({
  id: z.number().int(),
  seasonNumber: z.number().int(),
  episodeNumber: z.number().int(),
  airDateUtc: orNull(z.string()),
  monitored: z.boolean(),
  hasFile: z.boolean(),
  /** Sonarr sends 0 for an episode without a file; that reads as none. */
  episodeFileId: orNull(z.number().int().positive()),
})

/** One episode as Sonarr has it. */
export type SonarrEpisode = z.infer<typeof episodeSchema>

/** One episode file as Sonarr has it. */
export type SonarrEpisodeFile = ArrFile

/** Whether the series is monitored, and its quality profile. */
export type SonarrSeriesState = z.infer<typeof seriesSchema>

export async function getSonarrSeriesState(config: SonarrParsed, seriesId: number): Promise<ConnectionResult<SonarrSeriesState>> {
  if (!positiveId.safeParse(seriesId).success) return invalidArrParams("Sonarr")
  const result = await serviceFetch({ service: "Sonarr", url: `${config.url}/api/v3/series/${seriesId}`, headers: { "X-Api-Key": config.apiKey }, schema: seriesSchema })
  return toConnectionResult("Sonarr", result)
}

/** Every episode of the series, specials included. */
export async function listSonarrEpisodes(config: SonarrParsed, seriesId: number): Promise<ConnectionResult<SonarrEpisode[]>> {
  return arrList("Sonarr", config, "/api/v3/episode", arrQuery(seriesIdParams, { seriesId }), episodeSchema)
}

/** Every episode file of the series. */
export async function listSonarrEpisodeFiles(config: SonarrParsed, seriesId: number): Promise<ConnectionResult<SonarrEpisodeFile[]>> {
  return arrList("Sonarr", config, "/api/v3/episodefile", arrQuery(seriesIdParams, { seriesId }), arrFileSchema)
}
