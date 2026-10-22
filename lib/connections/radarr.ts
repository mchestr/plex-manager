import { z } from "zod"

import { type RadarrParsed } from "@/lib/validations/radarr";
import { arrGet, arrGetList, arrGetPaged, arrQuery, invalidArrParams, testArrConnection, type ArrPage } from "@/lib/connections/arr-client";
import { type ConnectionResult } from "@/types/connection";

/*
 * Query parameters per endpoint, as Radarr's v3 controllers bind them
 * (GAP-07). Strict, so a parameter an endpoint ignores is a type error.
 * `page` and `pageSize` are added by `arrGetPaged`. The calendar and
 * wanted/missing return movies themselves, so they take no `includeMovie`.
 */
const historyParams = z.strictObject({ includeMovie: z.literal(true) })
const movieHistoryParams = z.strictObject({ movieId: z.number().int(), includeMovie: z.literal(true) })
const queueParams = z.strictObject({ includeMovie: z.literal(true) })
const calendarParams = z.strictObject({ start: z.string().optional(), end: z.string().optional() })
const missingParams = z.strictObject({ sortKey: z.literal("physicalRelease") })

export async function testRadarrConnection(config: RadarrParsed): Promise<{ success: boolean; error?: string }> {
  return testArrConnection("Radarr", config)
}

export async function getRadarrSystemStatus(config: RadarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, "/api/v3/system/status")
}

/** The download queue with each item's movie, up to `limit` (default 50) items. */
export async function getRadarrQueue(config: RadarrParsed, limit = 50): Promise<ConnectionResult<ArrPage>> {
  return arrGetPaged("Radarr", config, "/api/v3/queue", arrQuery(queueParams, { includeMovie: true }), limit)
}

export async function getRadarrHealth(config: RadarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, "/api/v3/health")
}

export async function getRadarrDiskSpace(config: RadarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, "/api/v3/diskspace")
}

export async function searchRadarrMovies(config: RadarrParsed, term: string): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, `/api/v3/movie/lookup?term=${encodeURIComponent(term)}`)
}

/**
 * Download history, newest first, with each record's movie. A movie reads
 * `/api/v3/history/movie`, because `/api/v3/history` ignores `movieId`;
 * otherwise the server-wide history. At most `pageSize` records.
 */
export async function getRadarrHistory(
  config: RadarrParsed,
  { pageSize, movieId }: { pageSize: number; movieId?: number }
): Promise<ConnectionResult<ArrPage>> {
  if (movieId !== undefined) {
    const query = arrQuery(movieHistoryParams, { movieId, includeMovie: true })
    return arrGetList("Radarr", config, "/api/v3/history/movie", query, pageSize)
  }
  return arrGetPaged("Radarr", config, "/api/v3/history", arrQuery(historyParams, { includeMovie: true }), pageSize)
}

export async function getRadarrMovies(config: RadarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, "/api/v3/movie")
}

export async function getRadarrMovieById(config: RadarrParsed, movieId: number): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, `/api/v3/movie/${movieId}`)
}

/** Movies releasing from `startDate` to `endDate`. */
export async function getRadarrCalendar(config: RadarrParsed, startDate?: string, endDate?: string): Promise<ConnectionResult<unknown>> {
  const query = arrQuery(calendarParams, { start: startDate, end: endDate })
  if (query === null) return invalidArrParams("Radarr")
  return arrGet("Radarr", config, query ? `/api/v3/calendar?${query}` : "/api/v3/calendar")
}

/** Missing movies, latest release first, up to `limit`. */
export async function getRadarrWantedMissing(config: RadarrParsed, limit = 20): Promise<ConnectionResult<ArrPage>> {
  return arrGetPaged("Radarr", config, "/api/v3/wanted/missing", arrQuery(missingParams, { sortKey: "physicalRelease" }), limit)
}

export async function getRadarrRootFolders(config: RadarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, "/api/v3/rootFolder")
}

export async function getRadarrQualityProfiles(config: RadarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, "/api/v3/qualityProfile")
}
