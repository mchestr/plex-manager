/**
 * What a swap reads from Radarr or Sonarr besides the file and its history:
 * the releases of an interactive search, the title's blocklist, and whether a
 * recycle bin keeps the files they delete (docs/problem-reports.md,
 * "Swap the copy").
 *
 * | Call                     | Endpoint                                                          |
 * |--------------------------|-------------------------------------------------------------------|
 * | {@link searchArrReleases}    | `GET /api/v3/release?movieId=` or `?episodeId=`: a live search of every indexer |
 * | {@link listTitleBlocklist}   | `GET /api/v3/blocklist/movie?movieId=`, or `GET /api/v3/blocklist?seriesIds=` |
 * | {@link getArrMediaManagement} | `GET /api/v3/config/mediamanagement`                             |
 *
 * The interactive search waits on every indexer, so it gets two minutes
 * where other calls get ten seconds. Radarr and Sonarr keep its results for
 * 30 minutes, which is how long a grab from them can wait.
 *
 * @module lib/connections/arr-swap
 */

import "server-only"

import { z } from "zod"

import { arrList, arrQuery, invalidArrParams } from "@/lib/connections/arr-client"
import { arrLanguagesSchema, arrQualitySchema, orNull, type ArrTitle } from "@/lib/connections/arr-upgrade"
import { serviceFetch, toConnectionResult } from "@/lib/connections/http"
import { type ConnectionResult } from "@/types/connection"

type ArrService = "Radarr" | "Sonarr"
type ArrConfig = { url: string; apiKey: string }

const SEARCH_TIMEOUT_MS = 120_000
const BLOCKLIST_PAGE = 200

const positiveId = z.number().int().positive()
const movieParams = z.strictObject({ movieId: positiveId })
const episodeParams = z.strictObject({ episodeId: positiveId })
const seriesBlocklistParams = z.strictObject({ seriesIds: positiveId, pageSize: z.number().int().positive() })

const releaseSchema = z
  .looseObject({
    guid: z.string().min(1),
    indexerId: z.number().int(),
    title: z.string(),
    infoHash: orNull(z.string()),
    quality: arrQualitySchema,
    customFormatScore: z.number().int().catch(0),
    rejected: z.boolean().catch(false),
    rejections: z.array(z.string()).catch([]),
    temporarilyRejected: z.boolean().catch(false),
    languages: arrLanguagesSchema,
    seeders: orNull(z.number().int()),
    mappedEpisodeInfo: z.array(z.looseObject({ id: z.number().int() })).optional().catch(undefined),
  })
  .transform(({ guid, indexerId, title, infoHash, quality, customFormatScore, rejected, rejections, temporarilyRejected, languages, seeders, mappedEpisodeInfo }) => ({
    guid,
    indexerId,
    title,
    infoHash: infoHash ? infoHash.toLowerCase() : null,
    quality,
    customFormatScore,
    rejected,
    rejections,
    temporarilyRejected,
    languages,
    seeders,
    /** Sonarr: the episodes the release holds; null where Sonarr doesn't say (v3). */
    episodeIds: mappedEpisodeInfo ? mappedEpisodeInfo.map((episode) => episode.id) : null,
  }))

/** One release of an interactive search, as the candidate rules read it. */
export type ArrRelease = z.infer<typeof releaseSchema>

/** What an interactive search is for: a movie, or one episode of a file. */
export type ReleaseTarget = { service: "radarr"; movieId: number } | { service: "sonarr"; episodeId: number }

/** Every release an interactive search finds; one that fails its schema is skipped. */
export async function searchArrReleases(config: ArrConfig, target: ReleaseTarget): Promise<ConnectionResult<ArrRelease[]>> {
  const service: ArrService = target.service === "radarr" ? "Radarr" : "Sonarr"
  const query = target.service === "radarr" ? arrQuery(movieParams, { movieId: target.movieId }) : arrQuery(episodeParams, { episodeId: target.episodeId })
  if (query === null) return invalidArrParams(service)
  const result = await serviceFetch({
    service,
    url: `${config.url}/api/v3/release?${query}`,
    headers: { "X-Api-Key": config.apiKey },
    schema: z.array(z.unknown()),
    timeoutMs: SEARCH_TIMEOUT_MS,
  })
  if (!result.ok) return toConnectionResult(service, result)
  return {
    success: true,
    data: result.data.flatMap((record) => {
      const parsed = releaseSchema.safeParse(record)
      return parsed.success ? [parsed.data] : []
    }),
  }
}

const blockedSchema = z.looseObject({ sourceTitle: z.string(), episodeIds: z.array(z.number().int()).optional().catch(undefined) })
const blockedPageSchema = z.looseObject({ records: z.array(z.unknown()) })

/** The release titles blocklisted for the title: Sonarr's first page of the series' entries, enough to confirm a new one. */
export async function listTitleBlocklist(config: ArrConfig, title: ArrTitle): Promise<ConnectionResult<string[]>> {
  if (title.service === "radarr") {
    const blocked = await arrList("Radarr", config, "/api/v3/blocklist/movie", arrQuery(movieParams, { movieId: title.id }), blockedSchema)
    return blocked.success ? { success: true, data: blocked.data.map((entry) => entry.sourceTitle) } : blocked
  }
  const query = arrQuery(seriesBlocklistParams, { seriesIds: title.id, pageSize: BLOCKLIST_PAGE })
  if (query === null) return invalidArrParams("Sonarr")
  const result = await serviceFetch({ service: "Sonarr", url: `${config.url}/api/v3/blocklist?${query}`, headers: { "X-Api-Key": config.apiKey }, schema: blockedPageSchema })
  if (!result.ok) return toConnectionResult("Sonarr", result)
  return {
    success: true,
    data: result.data.records.flatMap((record) => {
      const parsed = blockedSchema.safeParse(record)
      return parsed.success ? [parsed.data.sourceTitle] : []
    }),
  }
}

const mediaManagementSchema = z.looseObject({ recycleBin: orNull(z.string()) }).transform((config) => ({
  /** A recycle bin is set, so a deleted or replaced file can be brought back. */
  recycleBin: Boolean(config.recycleBin?.trim()),
}))

export type ArrMediaManagement = z.infer<typeof mediaManagementSchema>

export async function getArrMediaManagement(service: ArrService, config: ArrConfig): Promise<ConnectionResult<ArrMediaManagement>> {
  const result = await serviceFetch({ service, url: `${config.url}/api/v3/config/mediamanagement`, headers: { "X-Api-Key": config.apiKey }, schema: mediaManagementSchema })
  return toConnectionResult(service, result)
}
