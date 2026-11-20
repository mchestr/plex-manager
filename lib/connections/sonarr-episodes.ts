/**
 * A Sonarr series' episodes and episode files, and the search for missing
 * episodes, for the problem report fixes (docs/problem-reports.md).
 *
 * `GET /api/v3/episode?seriesId=` and `GET /api/v3/episodefile?seriesId=`
 * list them; a record that fails its schema is skipped. The search is
 * `POST /api/v3/command {"name": "EpisodeSearch", "episodeIds": [...]}`,
 * which searches exactly those episodes and removes nothing.
 *
 * @module lib/connections/sonarr-episodes
 */

import "server-only"

import { z } from "zod"

import { arrList, arrPost, arrQuery, invalidArrParams } from "@/lib/connections/arr-client"
import { type SonarrParsed } from "@/lib/validations/sonarr"
import { type ConnectionResult } from "@/types/connection"

const seriesIdParams = z.strictObject({ seriesId: z.number().int().positive() })

/** A field Sonarr may leave out or send as null: always `null` when it isn't the type. */
const orNull = <T extends z.ZodType>(schema: T) => schema.nullish().catch(null).transform((value) => value ?? null)

const episodeSchema = z.looseObject({
  id: z.number().int(),
  seasonNumber: z.number().int(),
  episodeNumber: z.number().int(),
  airDateUtc: orNull(z.string()),
  monitored: z.boolean(),
  hasFile: z.boolean(),
  episodeFileId: orNull(z.number().int()),
})

const episodeFileSchema = z.looseObject({
  id: z.number().int(),
  relativePath: orNull(z.string()),
  path: orNull(z.string()),
})

const commandSchema = z.looseObject({ id: z.number().int() })

/** One episode as Sonarr has it. */
export type SonarrEpisode = z.infer<typeof episodeSchema>

/** One episode file as Sonarr has it. */
export type SonarrEpisodeFile = z.infer<typeof episodeFileSchema>

/** Every episode of the series, specials included. */
export async function listSonarrEpisodes(config: SonarrParsed, seriesId: number): Promise<ConnectionResult<SonarrEpisode[]>> {
  return arrList("Sonarr", config, "/api/v3/episode", arrQuery(seriesIdParams, { seriesId }), episodeSchema)
}

/** Every episode file of the series. */
export async function listSonarrEpisodeFiles(config: SonarrParsed, seriesId: number): Promise<ConnectionResult<SonarrEpisodeFile[]>> {
  return arrList("Sonarr", config, "/api/v3/episodefile", arrQuery(seriesIdParams, { seriesId }), episodeFileSchema)
}

/** Asks Sonarr to search for these episodes; the answer is the queued command's id. */
export async function searchSonarrEpisodes(config: SonarrParsed, episodeIds: readonly number[]): Promise<ConnectionResult<{ id: number }>> {
  if (episodeIds.length === 0 || !episodeIds.every((id) => Number.isInteger(id) && id > 0)) return invalidArrParams("Sonarr")
  return arrPost("Sonarr", config, "/api/v3/command", { name: "EpisodeSearch", episodeIds }, commandSchema)
}
