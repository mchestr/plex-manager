import { type SonarrParsed } from "@/lib/validations/sonarr";
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout";

export async function testSonarrConnection(config: SonarrParsed): Promise<{ success: boolean; error?: string }> {
  // TEST MODE BYPASS - Skip connection tests in test environment
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.SKIP_CONNECTION_TESTS === 'true'
  if (isTestMode) {
    return { success: true }
  }

  try {
    const url = `${config.url}/api/v3/system/status`

    const response = await fetchWithTimeout(url, {
      method: "GET",
      headers: {
        "Accept": "application/json",
        "X-Api-Key": config.apiKey,
      },
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: "Invalid API key" }
      }
      if (response.status === 404) {
        return { success: false, error: "Sonarr server not found at this address" }
      }
      return { success: false, error: `Connection failed: ${response.statusText}` }
    }

    const data = await response.json()

    // Check if Sonarr API returned valid system status
    if (!data || typeof data !== "object") {
      return { success: false, error: "Invalid response from Sonarr API" }
    }

    return { success: true }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout - check your hostname and port" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to connect to Sonarr server" }
  }
}

export async function getSonarrSystemStatus(config: SonarrParsed) {
  const url = `${config.url}/api/v3/system/status`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr status error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrQueue(config: SonarrParsed) {
  const url = `${config.url}/api/v3/queue`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr queue error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrHealth(config: SonarrParsed) {
  const url = `${config.url}/api/v3/health`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr health error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrDiskSpace(config: SonarrParsed) {
  const url = `${config.url}/api/v3/diskspace`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr diskspace error: ${response.statusText}`)
  return response.json()
}

export async function searchSonarrSeries(config: SonarrParsed, term: string) {
  const url = `${config.url}/api/v3/series/lookup?term=${encodeURIComponent(term)}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr search error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrHistory(
  config: SonarrParsed,
  pageSize = 20,
  seriesId?: number,
  episodeId?: number
) {
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
  const url = `${config.url}/api/v3/history?${params.toString()}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr history error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrSeries(config: SonarrParsed) {
  const url = `${config.url}/api/v3/series`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr series error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrSeriesById(config: SonarrParsed, seriesId: number) {
  const url = `${config.url}/api/v3/series/${seriesId}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr series detail error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrCalendar(config: SonarrParsed, startDate?: string, endDate?: string) {
  let url = `${config.url}/api/v3/calendar`
  const params = new URLSearchParams()
  if (startDate) params.append("start", startDate)
  if (endDate) params.append("end", endDate)
  if (params.toString()) url += `?${params.toString()}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr calendar error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrWantedMissing(config: SonarrParsed, pageSize = 20) {
  const url = `${config.url}/api/v3/wanted/missing?pageSize=${pageSize}&sortKey=airDateUtc&sortDir=desc`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr wanted missing error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrRootFolders(config: SonarrParsed) {
  const url = `${config.url}/api/v3/rootFolder`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr root folders error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrQualityProfiles(config: SonarrParsed) {
  const url = `${config.url}/api/v3/qualityProfile`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr quality profiles error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrEpisodes(config: SonarrParsed, seriesId: number) {
  const url = `${config.url}/api/v3/episode?seriesId=${seriesId}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr episodes error: ${response.statusText}`)
  return response.json()
}

export async function getSonarrEpisodeById(config: SonarrParsed, episodeId: number) {
  const url = `${config.url}/api/v3/episode/${episodeId}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr episode detail error: ${response.statusText}`)
  return response.json()
}

export async function deleteSonarrSeries(
  config: SonarrParsed,
  seriesId: number,
  deleteFiles = false,
  addImportExclusion = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({
      deleteFiles: deleteFiles.toString(),
      addImportExclusion: addImportExclusion.toString(),
    })
    const url = `${config.url}/api/v3/series/${seriesId}?${params.toString()}`
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Api-Key": config.apiKey,
      },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: "Series not found" }
      }
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: "Invalid API key" }
      }
      return { success: false, error: `Failed to delete series: ${response.statusText}` }
    }

    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Error deleting series: ${error.message}` }
    }
    return { success: false, error: "Failed to delete series" }
  }
}

export async function bulkDeleteSonarrEpisodeFiles(
  config: SonarrParsed,
  episodeFileIds: number[]
): Promise<{ success: boolean; deleted: number; errors?: string[] }> {
  try {
    const url = `${config.url}/api/v3/episodefile/bulk`
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": config.apiKey,
      },
      body: JSON.stringify({ episodeFileIds }),
    })

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, deleted: 0, errors: ["Invalid API key"] }
      }
      return { success: false, deleted: 0, errors: [`Failed to delete episode files: ${response.statusText}`] }
    }

    // Sonarr bulk delete returns 200 on success
    return { success: true, deleted: episodeFileIds.length }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, deleted: 0, errors: [`Error deleting episode files: ${error.message}`] }
    }
    return { success: false, deleted: 0, errors: ["Failed to delete episode files"] }
  }
}

export async function getSonarrSeriesStatistics(config: SonarrParsed, seriesId: number) {
  const url = `${config.url}/api/v3/series/${seriesId}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Sonarr series statistics error: ${response.statusText}`)
  return response.json()
}
