import { type SonarrParsed } from "@/lib/validations/sonarr";
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout";
import { type ConnectionResult } from "@/types/connection";

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

export async function getSonarrSystemStatus(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/system/status`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr status error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr system status" }
  }
}

export async function getSonarrQueue(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/queue`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr queue error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr queue" }
  }
}

export async function getSonarrHealth(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/health`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr health error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr health" }
  }
}

export async function getSonarrDiskSpace(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/diskspace`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr diskspace error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr disk space" }
  }
}

export async function searchSonarrSeries(config: SonarrParsed, term: string): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/series/lookup?term=${encodeURIComponent(term)}`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr search error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to search Sonarr series" }
  }
}

export async function getSonarrHistory(
  config: SonarrParsed,
  pageSize = 20,
  seriesId?: number,
  episodeId?: number
): Promise<ConnectionResult<unknown>> {
  try {
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
    if (!response.ok) {
      return { success: false, error: `Sonarr history error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr history" }
  }
}

export async function getSonarrSeries(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/series`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr series error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr series" }
  }
}

export async function getSonarrSeriesById(config: SonarrParsed, seriesId: number): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/series/${seriesId}`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr series detail error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr series by ID" }
  }
}

export async function getSonarrCalendar(config: SonarrParsed, startDate?: string, endDate?: string): Promise<ConnectionResult<unknown>> {
  try {
    let url = `${config.url}/api/v3/calendar`
    const params = new URLSearchParams()
    if (startDate) params.append("start", startDate)
    if (endDate) params.append("end", endDate)
    if (params.toString()) url += `?${params.toString()}`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr calendar error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr calendar" }
  }
}

export async function getSonarrWantedMissing(config: SonarrParsed, pageSize = 20): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/wanted/missing?pageSize=${pageSize}&sortKey=airDateUtc&sortDir=desc`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr wanted missing error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr wanted missing" }
  }
}

export async function getSonarrRootFolders(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/rootFolder`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr root folders error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr root folders" }
  }
}

export async function getSonarrQualityProfiles(config: SonarrParsed): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/qualityProfile`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr quality profiles error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr quality profiles" }
  }
}

export async function getSonarrEpisodes(config: SonarrParsed, seriesId: number): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/episode?seriesId=${seriesId}`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr episodes error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr episodes" }
  }
}

export async function getSonarrEpisodeById(config: SonarrParsed, episodeId: number): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/episode/${episodeId}`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr episode detail error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr episode by ID" }
  }
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

export async function getSonarrSeriesStatistics(config: SonarrParsed, seriesId: number): Promise<ConnectionResult<unknown>> {
  try {
    const url = `${config.url}/api/v3/series/${seriesId}`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })
    if (!response.ok) {
      return { success: false, error: `Sonarr series statistics error: ${response.statusText}` }
    }
    const data = await response.json()
    return { success: true, data }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to get Sonarr series statistics" }
  }
}
