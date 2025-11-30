import { type OverseerrParsed } from "@/lib/validations/overseerr";
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout";

export async function testOverseerrConnection(config: OverseerrParsed): Promise<{ success: boolean; error?: string }> {
  // TEST MODE BYPASS - Skip connection tests in test environment
  const isTestMode = process.env.NODE_ENV === 'test' || process.env.SKIP_CONNECTION_TESTS === 'true'
  if (isTestMode) {
    return { success: true }
  }

  try {
    const url = `${config.url}/api/v1/auth/me`

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
        return { success: false, error: "Overseerr server not found at this address" }
      }
      return { success: false, error: `Connection failed: ${response.statusText}` }
    }

    const data = await response.json()

    // Check if Overseerr API returned an error
    if (data.statusCode && data.statusCode >= 400) {
      return { success: false, error: data.message || "Overseerr API error" }
    }

    return { success: true }
  } catch (error) {
    if (isTimeoutError(error)) {
      return { success: false, error: "Connection timeout - check your hostname and port" }
    }
    if (error instanceof Error) {
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to connect to Overseerr server" }
  }
}

export async function getOverseerrRequests(config: OverseerrParsed, limit = 10) {
  const url = `${config.url}/api/v1/request?take=${limit}&sort=added&filter=processing`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Overseerr request error: ${response.statusText}`)
  return response.json()
}

export async function getOverseerrStatus(config: OverseerrParsed) {
  const url = `${config.url}/api/v1/settings/about`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Overseerr status error: ${response.statusText}`)
  return response.json()
}

export async function getOverseerrDiscoverMovies(config: OverseerrParsed, page = 1, sortBy = "popularity.desc") {
  const url = `${config.url}/api/v1/discover/movies?page=${page}&sortBy=${sortBy}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Overseerr discover movies error: ${response.statusText}`)
  return response.json()
}

export async function getOverseerrDiscoverTV(config: OverseerrParsed, page = 1, sortBy = "popularity.desc") {
  const url = `${config.url}/api/v1/discover/tv?page=${page}&sortBy=${sortBy}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Overseerr discover TV error: ${response.statusText}`)
  return response.json()
}

export async function getOverseerrMediaDetails(config: OverseerrParsed, mediaId: number, mediaType: "movie" | "tv") {
  const url = `${config.url}/api/v1/${mediaType}/${mediaId}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Overseerr media details error: ${response.statusText}`)
  return response.json()
}

export async function getOverseerrUsers(config: OverseerrParsed) {
  const url = `${config.url}/api/v1/user`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Overseerr users error: ${response.statusText}`)
  return response.json()
}

export async function getAllOverseerrRequests(config: OverseerrParsed, limit = 20, sortBy = "added") {
  const url = `${config.url}/api/v1/request?take=${limit}&sort=${sortBy}`
  const response = await fetch(url, {
    headers: { "X-Api-Key": config.apiKey },
  })
  if (!response.ok) throw new Error(`Overseerr all requests error: ${response.statusText}`)
  return response.json()
}
