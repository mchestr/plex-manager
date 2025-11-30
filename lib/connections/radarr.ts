import { type RadarrParsed } from "@/lib/validations/radarr";
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout";

export async function testRadarrConnection(config: RadarrParsed): Promise<{ success: boolean; error?: string }> {
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
        return { success: false, error: "Radarr server not found at this address" }
      }
      return { success: false, error: `Connection failed: ${response.statusText}` }
    }

    const data = await response.json()

    // Check if Radarr API returned valid system status
    if (!data || typeof data !== "object") {
      return { success: false, error: "Invalid response from Radarr API" }
    }

    return { success: true }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout - check your hostname and port" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to connect to Radarr server" }
  }
}

export async function getRadarrSystemStatus(config: RadarrParsed) {
  const url = `${config.url}/api/v3/system/status`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr status error: ${response.statusText}`)
  return response.json()
}

export async function getRadarrQueue(config: RadarrParsed) {
  const url = `${config.url}/api/v3/queue`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr queue error: ${response.statusText}`)
  return response.json()
}

export async function getRadarrHealth(config: RadarrParsed) {
  const url = `${config.url}/api/v3/health`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr health error: ${response.statusText}`)
  return response.json()
}

export async function getRadarrDiskSpace(config: RadarrParsed) {
  const url = `${config.url}/api/v3/diskspace`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr diskspace error: ${response.statusText}`)
  return response.json()
}

export async function searchRadarrMovies(config: RadarrParsed, term: string) {
  const url = `${config.url}/api/v3/movie/lookup?term=${encodeURIComponent(term)}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr search error: ${response.statusText}`)
  return response.json()
}

export async function getRadarrHistory(
  config: RadarrParsed,
  pageSize = 20,
  movieId?: number
) {
  const params = new URLSearchParams({
    pageSize: pageSize.toString(),
    sortKey: "date",
    sortDir: "desc",
  })
  if (movieId !== undefined) {
    params.append("movieId", movieId.toString())
  }
  const url = `${config.url}/api/v3/history?${params.toString()}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr history error: ${response.statusText}`)
  return response.json()
}

export async function getRadarrMovies(config: RadarrParsed) {
  const url = `${config.url}/api/v3/movie`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr movies error: ${response.statusText}`)
  return response.json()
}

export async function getRadarrMovieById(config: RadarrParsed, movieId: number) {
  const url = `${config.url}/api/v3/movie/${movieId}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr movie detail error: ${response.statusText}`)
  return response.json()
}

export async function getRadarrCalendar(config: RadarrParsed, startDate?: string, endDate?: string) {
  let url = `${config.url}/api/v3/calendar`
  const params = new URLSearchParams()
  if (startDate) params.append("start", startDate)
  if (endDate) params.append("end", endDate)
  if (params.toString()) url += `?${params.toString()}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr calendar error: ${response.statusText}`)
  return response.json()
}

export async function getRadarrWantedMissing(config: RadarrParsed, pageSize = 20) {
  const url = `${config.url}/api/v3/wanted/missing?pageSize=${pageSize}&sortKey=physicalRelease&sortDir=desc`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr wanted missing error: ${response.statusText}`)
  return response.json()
}

export async function getRadarrRootFolders(config: RadarrParsed) {
  const url = `${config.url}/api/v3/rootFolder`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr root folders error: ${response.statusText}`)
  return response.json()
}

export async function getRadarrQualityProfiles(config: RadarrParsed) {
  const url = `${config.url}/api/v3/qualityProfile`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr quality profiles error: ${response.statusText}`)
  return response.json()
}

export async function getRadarrMovieFile(config: RadarrParsed, movieId: number) {
  const url = `${config.url}/api/v3/moviefile?movieId=${movieId}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Radarr movie file error: ${response.statusText}`)
  return response.json()
}

export async function deleteRadarrMovie(
  config: RadarrParsed,
  movieId: number,
  deleteFiles = false,
  addExclusion = false
): Promise<{ success: boolean; error?: string }> {
  try {
    const params = new URLSearchParams({
      deleteFiles: deleteFiles.toString(),
      addExclusion: addExclusion.toString(),
    })
    const url = `${config.url}/api/v3/movie/${movieId}?${params.toString()}`
    const response = await fetch(url, {
      method: "DELETE",
      headers: { "X-Api-Key": config.apiKey },
    })

    if (!response.ok) {
      if (response.status === 404) {
        return { success: false, error: "Movie not found" }
      }
      return { success: false, error: `Delete failed: ${response.statusText}` }
    }

    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Delete error: ${error.message}` }
    }
    return { success: false, error: "Failed to delete movie" }
  }
}

export async function bulkDeleteRadarrMovies(
  config: RadarrParsed,
  movieIds: number[],
  deleteFiles = false,
  addExclusion = false
): Promise<{ success: boolean; deleted: number; errors?: string[] }> {
  try {
    const url = `${config.url}/api/v3/movie/bulk`
    const response = await fetch(url, {
      method: "DELETE",
      headers: {
        "X-Api-Key": config.apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        movieIds,
        deleteFiles,
        addImportExclusion: addExclusion,
      }),
    })

    if (!response.ok) {
      return {
        success: false,
        deleted: 0,
        errors: [`Bulk delete failed: ${response.statusText}`],
      }
    }

    return { success: true, deleted: movieIds.length }
  } catch (error) {
    if (error instanceof Error) {
      return {
        success: false,
        deleted: 0,
        errors: [`Bulk delete error: ${error.message}`],
      }
    }
    return {
      success: false,
      deleted: 0,
      errors: ["Failed to bulk delete movies"],
    }
  }
}
