import { z } from "zod"

import { type SonarrParsed } from "@/lib/validations/sonarr";
import { arrGet, arrGetList, arrGetPaged, arrQuery, invalidArrParams, testArrConnection, type ArrPage } from "@/lib/connections/arr-client";
import { type ConnectionResult } from "@/types/connection";

/*
 * Query parameters per endpoint, as Sonarr's v3 controllers bind them
 * (GAP-07). Strict, so a parameter an endpoint ignores is a type error.
 * `page` and `pageSize` are added by `arrGetPaged`.
 */
const withSeriesAndEpisode = { includeSeries: z.literal(true), includeEpisode: z.literal(true) }
const historyParams = z.strictObject({ ...withSeriesAndEpisode, episodeId: z.number().int().optional() })
const seriesHistoryParams = z.strictObject({ ...withSeriesAndEpisode, seriesId: z.number().int() })
const queueParams = z.strictObject(withSeriesAndEpisode)
const calendarParams = z.strictObject({ start: z.string().optional(), end: z.string().optional(), includeSeries: z.literal(true) })
const missingParams = z.strictObject({ includeSeries: z.literal(true), sortKey: z.literal("airDateUtc") })

export async function testSonarrConnection(config: SonarrParsed): Promise<{ success: boolean; error?: string }> {
  return testArrConnection("Sonarr", config)
}

export async function getSonarrSystemStatus(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, "/api/v3/system/status")
}

/** The download queue with each item's series and episode, up to `limit` (default 50) items. */
export async function getSonarrQueue(config: SonarrParsed, limit = 50): Promise<ConnectionResult<ArrPage>> {
  const query = arrQuery(queueParams, { includeSeries: true, includeEpisode: true })
  return arrGetPaged("Sonarr", config, "/api/v3/queue", query, limit)
}

export async function getSonarrHealth(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, "/api/v3/health")
}

export async function getSonarrDiskSpace(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, "/api/v3/diskspace")
}

export async function searchSonarrSeries(config: SonarrParsed, term: string): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, `/api/v3/series/lookup?term=${encodeURIComponent(term)}`)
}

/**
 * Download history, newest first, with series and episode. An episode reads
 * `/api/v3/history?episodeId=`; a series reads `/api/v3/history/series`,
 * because `/api/v3/history` ignores `seriesId`; otherwise the server-wide
 * history. At most `pageSize` records.
 */
export async function getSonarrHistory(
  config: SonarrParsed,
  { pageSize, seriesId, episodeId }: { pageSize: number; seriesId?: number; episodeId?: number }
): Promise<ConnectionResult<ArrPage>> {
  if (seriesId !== undefined && episodeId === undefined) {
    const query = arrQuery(seriesHistoryParams, { seriesId, includeSeries: true, includeEpisode: true })
    return arrGetList("Sonarr", config, "/api/v3/history/series", query, pageSize)
  }
  const query = arrQuery(historyParams, { episodeId, includeSeries: true, includeEpisode: true })
  return arrGetPaged("Sonarr", config, "/api/v3/history", query, pageSize)
}

export async function getSonarrSeries(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, "/api/v3/series")
}

export async function getSonarrSeriesById(config: SonarrParsed, seriesId: number): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, `/api/v3/series/${seriesId}`)
}

/** Episodes airing from `startDate` to `endDate`, each with its series (title, `tvdbId`, `tmdbId`). */
export async function getSonarrCalendar(config: SonarrParsed, startDate?: string, endDate?: string): Promise<ConnectionResult<unknown>> {
  const query = arrQuery(calendarParams, { start: startDate, end: endDate, includeSeries: true })
  if (query === null) return invalidArrParams("Sonarr")
  return arrGet("Sonarr", config, `/api/v3/calendar?${query}`)
}

/** Missing episodes with their series, latest air date first, up to `limit`. */
export async function getSonarrWantedMissing(config: SonarrParsed, limit = 20): Promise<ConnectionResult<ArrPage>> {
  const query = arrQuery(missingParams, { includeSeries: true, sortKey: "airDateUtc" })
  return arrGetPaged("Sonarr", config, "/api/v3/wanted/missing", query, limit)
}

export async function getSonarrRootFolders(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, "/api/v3/rootFolder")
}

export async function getSonarrQualityProfiles(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, "/api/v3/qualityProfile")
}

export async function getSonarrEpisodes(config: SonarrParsed, seriesId: number): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, `/api/v3/episode?seriesId=${seriesId}`)
}

export async function getSonarrEpisodeById(config: SonarrParsed, episodeId: number): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, `/api/v3/episode/${episodeId}`)
}
