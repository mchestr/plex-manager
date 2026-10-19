import { type RadarrParsed } from "@/lib/validations/radarr";
import { arrGet, testArrConnection } from "@/lib/connections/arr-client";
import { type ConnectionResult } from "@/types/connection";

export async function testRadarrConnection(config: RadarrParsed): Promise<{ success: boolean; error?: string }> {
  return testArrConnection("Radarr", config)
}

export async function getRadarrSystemStatus(config: RadarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, "/api/v3/system/status")
}

export async function getRadarrQueue(config: RadarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, "/api/v3/queue")
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

export async function getRadarrHistory(
  config: RadarrParsed,
  pageSize = 20,
  movieId?: number
): Promise<ConnectionResult<unknown>> {
  const params = new URLSearchParams({
    pageSize: pageSize.toString(),
    sortKey: "date",
    sortDir: "desc",
  })
  if (movieId !== undefined) {
    params.append("movieId", movieId.toString())
  }
  return arrGet("Radarr", config, `/api/v3/history?${params.toString()}`)
}

export async function getRadarrMovies(config: RadarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, "/api/v3/movie")
}

export async function getRadarrMovieById(config: RadarrParsed, movieId: number): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, `/api/v3/movie/${movieId}`)
}

export async function getRadarrCalendar(config: RadarrParsed, startDate?: string, endDate?: string): Promise<ConnectionResult<unknown>> {
  let path = "/api/v3/calendar"
  const params = new URLSearchParams()
  if (startDate) params.append("start", startDate)
  if (endDate) params.append("end", endDate)
  if (params.toString()) path += `?${params.toString()}`
  return arrGet("Radarr", config, path)
}

export async function getRadarrWantedMissing(config: RadarrParsed, pageSize = 20): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, `/api/v3/wanted/missing?pageSize=${pageSize}&sortKey=physicalRelease&sortDir=desc`)
}

export async function getRadarrRootFolders(config: RadarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, "/api/v3/rootFolder")
}

export async function getRadarrQualityProfiles(config: RadarrParsed): Promise<ConnectionResult<unknown>> {
  return arrGet("Radarr", config, "/api/v3/qualityProfile")
}
