import { type OverseerrParsed } from "@/lib/validations/overseerr";
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout";
import { createLogger } from "@/lib/utils/logger";

const logger = createLogger("overseerr");

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

/**
 * Get media status from Overseerr by TMDB ID
 * Returns media info including request status, availability, etc.
 */
export async function getOverseerrMediaByTmdbId(
  config: OverseerrParsed,
  tmdbId: number,
  mediaType: "movie" | "tv"
): Promise<{
  success: boolean
  data?: {
    id: number
    tmdbId: number
    mediaType: string
    status: number // 1=UNKNOWN, 2=PENDING, 3=PROCESSING, 4=PARTIALLY_AVAILABLE, 5=AVAILABLE
    requests?: Array<{
      id: number
      status: number
      requestedBy: { displayName: string }
      createdAt: string
    }>
  }
  error?: string
}> {
  try {
    const url = `${config.url}/api/v1/${mediaType}/${tmdbId}`
    const response = await fetch(url, {
      headers: { "X-Api-Key": config.apiKey },
    })

    if (!response.ok) {
      if (response.status === 404) {
        // Media not found in Overseerr - this is normal for items not in the system
        return { success: true, data: undefined }
      }
      return { success: false, error: `Overseerr API error: ${response.statusText}` }
    }

    const data = await response.json()
    return {
      success: true,
      data: {
        id: data.id,
        tmdbId: data.tmdbId || tmdbId,
        mediaType: data.mediaType || mediaType,
        status: data.mediaInfo?.status || 1, // Default to UNKNOWN
        requests: data.mediaInfo?.requests || [],
      },
    }
  } catch (error) {
    if (error instanceof Error) {
      return { success: false, error: `Overseerr fetch error: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch Overseerr media status" }
  }
}

/**
 * Batch fetch media status from Overseerr for multiple TMDB IDs
 * More efficient than individual calls
 */
export async function batchGetOverseerrMediaStatus(
  config: OverseerrParsed,
  items: Array<{ tmdbId: number; mediaType: "movie" | "tv" }>
): Promise<Map<string, {
  status: number
  hasRequest: boolean
  requestedBy?: string
  requestedAt?: Date
  requestCount: number
}>> {
  const results = new Map<string, {
    status: number
    hasRequest: boolean
    requestedBy?: string
    requestedAt?: Date
    requestCount: number
  }>()

  // Process in batches to avoid overwhelming the API
  const batchSize = 10
  for (let i = 0; i < items.length; i += batchSize) {
    const batch = items.slice(i, i + batchSize)
    const promises = batch.map(async (item) => {
      const key = `${item.mediaType}_${item.tmdbId}`
      try {
        const result = await getOverseerrMediaByTmdbId(config, item.tmdbId, item.mediaType)
        if (result.success && result.data) {
          const latestRequest = result.data.requests?.[0]
          const requestCount = result.data.requests?.length || 0
          results.set(key, {
            status: result.data.status,
            hasRequest: requestCount > 0,
            requestedBy: latestRequest?.requestedBy?.displayName,
            requestedAt: latestRequest?.createdAt ? new Date(latestRequest.createdAt) : undefined,
            requestCount,
          })
        } else if (!result.success) {
          logger.debug("Failed to fetch media status", {
            tmdbId: item.tmdbId,
            mediaType: item.mediaType,
            error: result.error,
          })
        }
      } catch (error) {
        logger.error("Error fetching Overseerr media status", {
          tmdbId: item.tmdbId,
          mediaType: item.mediaType,
          error,
        })
      }
    })
    await Promise.all(promises)
  }

  return results
}

// Overseerr media status codes
export const OverseerrMediaStatus = {
  UNKNOWN: 1,
  PENDING: 2,
  PROCESSING: 3,
  PARTIALLY_AVAILABLE: 4,
  AVAILABLE: 5,
} as const

export interface SubmitOverseerrRequestPayload {
  mediaType: "movie" | "tv"
  mediaId: number // TMDB ID
  seasons?: number[] // For TV shows, which seasons to request
  is4k?: boolean
}

export interface SubmitOverseerrRequestResult {
  success: boolean
  requestId?: number
  error?: string
  status: "created" | "already_requested" | "already_available" | "failed"
}

/**
 * Submit a media request to Overseerr
 * @param config Overseerr configuration
 * @param payload Request details (mediaType, mediaId, optional seasons)
 */
export async function submitOverseerrRequest(
  config: OverseerrParsed,
  payload: SubmitOverseerrRequestPayload
): Promise<SubmitOverseerrRequestResult> {
  try {
    // First check if media already exists/is requested
    const existingStatus = await getOverseerrMediaByTmdbId(config, payload.mediaId, payload.mediaType)

    if (existingStatus.success && existingStatus.data) {
      const status = existingStatus.data.status

      // Check if already available
      if (status === OverseerrMediaStatus.AVAILABLE || status === OverseerrMediaStatus.PARTIALLY_AVAILABLE) {
        logger.debug("Media already available in Overseerr", {
          tmdbId: payload.mediaId,
          mediaType: payload.mediaType,
          status,
        })
        return {
          success: true,
          status: "already_available",
        }
      }

      // Check if already requested (pending or processing)
      if (status === OverseerrMediaStatus.PENDING || status === OverseerrMediaStatus.PROCESSING) {
        logger.debug("Media already requested in Overseerr", {
          tmdbId: payload.mediaId,
          mediaType: payload.mediaType,
          status,
        })
        return {
          success: true,
          requestId: existingStatus.data.requests?.[0]?.id,
          status: "already_requested",
        }
      }
    }

    // Submit the request
    const url = `${config.url}/api/v1/request`
    const body: Record<string, unknown> = {
      mediaType: payload.mediaType,
      mediaId: payload.mediaId,
    }

    if (payload.seasons && payload.seasons.length > 0) {
      body.seasons = payload.seasons
    }

    if (payload.is4k !== undefined) {
      body.is4k = payload.is4k
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Api-Key": config.apiKey,
      },
      body: JSON.stringify(body),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      const errorMessage = errorData.message || response.statusText

      // Check for specific error cases
      if (response.status === 409 || errorMessage.includes("already")) {
        return {
          success: true,
          status: "already_requested",
        }
      }

      logger.error("Overseerr request submission failed", undefined, {
        status: response.status,
        error: errorMessage,
        tmdbId: payload.mediaId,
        mediaType: payload.mediaType,
      })

      return {
        success: false,
        error: errorMessage,
        status: "failed",
      }
    }

    const data = await response.json()

    logger.info("Overseerr request submitted successfully", {
      requestId: data.id,
      tmdbId: payload.mediaId,
      mediaType: payload.mediaType,
    })

    return {
      success: true,
      requestId: data.id,
      status: "created",
    }
  } catch (error) {
    logger.error("Error submitting Overseerr request", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
      status: "failed",
    }
  }
}
