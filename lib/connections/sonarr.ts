import { type SonarrParsed } from "@/lib/validations/sonarr";
import { arrGet, testArrConnection } from "@/lib/connections/arr-client";
import { type ConnectionResult } from "@/types/connection";

export async function testSonarrConnection(config: SonarrParsed): Promise<{ success: boolean; error?: string }> {
  return testArrConnection("Sonarr", config)
}

export async function getSonarrSystemStatus(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, "/api/v3/system/status")
}

export async function getSonarrQueue(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, "/api/v3/queue")
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

export async function getSonarrHistory(
  config: SonarrParsed,
  pageSize = 20,
  seriesId?: number,
  episodeId?: number
): Promise<ConnectionResult<unknown>> {
  const params = new URLSearchParams({
    pageSize: pageSize.toString(),
    sortKey: "date",
    sortDir: "desc",
  })
  if (seriesId !== undefined) {
    params.append("seriesId", seriesId.toString())
  }
  if (episodeId !== undefined) {
    params.append("episodeId", episodeId.toString())
  }
  return arrGet("Sonarr", config, `/api/v3/history?${params.toString()}`)
}

export async function getSonarrSeries(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, "/api/v3/series")
}

export async function getSonarrSeriesById(config: SonarrParsed, seriesId: number): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, `/api/v3/series/${seriesId}`)
}

/** `includeSeries` adds each episode's series (its title, `tvdbId` and `tmdbId`). */
export async function getSonarrCalendar(
  config: SonarrParsed,
  startDate?: string,
  endDate?: string,
  options: { includeSeries?: boolean } = {}
): Promise<ConnectionResult<unknown>> {
  let path = "/api/v3/calendar"
  const params = new URLSearchParams()
  if (startDate) params.append("start", startDate)
  if (endDate) params.append("end", endDate)
  if (options.includeSeries) params.append("includeSeries", "true")
  if (params.toString()) path += `?${params.toString()}`
  return arrGet("Sonarr", config, path)
}

export async function getSonarrWantedMissing(config: SonarrParsed, pageSize = 20): Promise<ConnectionResult<unknown>> {
  return arrGet("Sonarr", config, `/api/v3/wanted/missing?pageSize=${pageSize}&sortKey=airDateUtc&sortDir=desc`)
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
