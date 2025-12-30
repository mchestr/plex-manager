/**
 * Plex Watchlist API client
 *
 * Fetches user's watchlist from the Plex discover API
 * API Endpoint: https://discover.provider.plex.tv/library/sections/watchlist/all
 */

import { getClientIdentifier } from "@/lib/connections/plex-core"
import { createLogger } from "@/lib/utils/logger"
import { WatchlistItem } from "@/lib/validations/watchlist"

const logger = createLogger("PLEX_WATCHLIST")

const PLEX_DISCOVER_URL = "https://discover.provider.plex.tv"

interface PlexWatchlistResponse {
  MediaContainer?: {
    size?: number
    Metadata?: PlexWatchlistMetadata[]
  }
}

interface PlexWatchlistMetadata {
  ratingKey: string
  key: string
  guid: string
  type: "movie" | "show"
  title: string
  year?: number
  Guid?: PlexGuid[]
}

interface PlexGuid {
  id: string // e.g., "tmdb://12345", "tvdb://12345", "imdb://tt12345"
}

/**
 * Parse external IDs from Plex GUID array
 * @param guids Array of Plex GUIDs with format like "tmdb://12345"
 */
export function parseExternalIds(guids: PlexGuid[] | undefined): {
  tmdbId?: number
  tvdbId?: number
  imdbId?: string
} {
  const result: { tmdbId?: number; tvdbId?: number; imdbId?: string } = {}

  if (!guids || !Array.isArray(guids)) {
    return result
  }

  for (const guid of guids) {
    if (!guid.id) continue

    if (guid.id.startsWith("tmdb://")) {
      const id = parseInt(guid.id.replace("tmdb://", ""), 10)
      if (!isNaN(id)) {
        result.tmdbId = id
      }
    } else if (guid.id.startsWith("tvdb://")) {
      const id = parseInt(guid.id.replace("tvdb://", ""), 10)
      if (!isNaN(id)) {
        result.tvdbId = id
      }
    } else if (guid.id.startsWith("imdb://")) {
      result.imdbId = guid.id.replace("imdb://", "")
    }
  }

  return result
}

/**
 * Parse a single GUID string to extract external ID
 * @param guid GUID string like "plex://movie/5d776833880197001ec939fa"
 */
export function parseWatchlistGuid(guid: string): {
  type: "plex" | "tmdb" | "tvdb" | "imdb" | "unknown"
  id: string
} {
  if (guid.startsWith("plex://")) {
    // Format: plex://movie/5d776833880197001ec939fa
    const parts = guid.split("/")
    return { type: "plex", id: parts[parts.length - 1] }
  } else if (guid.startsWith("tmdb://")) {
    return { type: "tmdb", id: guid.replace("tmdb://", "") }
  } else if (guid.startsWith("tvdb://")) {
    return { type: "tvdb", id: guid.replace("tvdb://", "") }
  } else if (guid.startsWith("imdb://")) {
    return { type: "imdb", id: guid.replace("imdb://", "") }
  }

  return { type: "unknown", id: guid }
}

/**
 * Get standard Plex headers for API requests
 */
function getPlexHeaders(userToken: string): Record<string, string> {
  return {
    Accept: "application/json",
    "X-Plex-Token": userToken,
    "X-Plex-Client-Identifier": getClientIdentifier(),
    "X-Plex-Product": "Plex Wrapped",
    "X-Plex-Version": "1.0.0",
    "X-Plex-Platform": "Web",
  }
}

export interface GetWatchlistResult {
  success: boolean
  data?: WatchlistItem[]
  error?: string
}

/**
 * Fetch user's watchlist from Plex discover API
 * @param userToken User's Plex auth token
 */
export async function getPlexWatchlist(userToken: string): Promise<GetWatchlistResult> {
  try {
    logger.debug("Fetching Plex watchlist")

    // Fetch watchlist from discover API
    const url = `${PLEX_DISCOVER_URL}/library/sections/watchlist/all`
    const response = await fetch(url, {
      method: "GET",
      headers: getPlexHeaders(userToken),
    })

    if (!response.ok) {
      if (response.status === 401) {
        logger.warn("Plex watchlist fetch failed - unauthorized (token may be expired)")
        return { success: false, error: "Plex token is invalid or expired" }
      }
      logger.error("Plex watchlist fetch failed", undefined, {
        status: response.status,
        statusText: response.statusText,
      })
      return { success: false, error: `Failed to fetch watchlist: ${response.statusText}` }
    }

    const data: PlexWatchlistResponse = await response.json()

    if (!data.MediaContainer?.Metadata) {
      logger.debug("Watchlist is empty")
      return { success: true, data: [] }
    }

    const items: WatchlistItem[] = data.MediaContainer.Metadata.map((item) => {
      const externalIds = parseExternalIds(item.Guid)

      return {
        ratingKey: item.ratingKey,
        guid: item.guid,
        type: item.type,
        title: item.title,
        year: item.year,
        tmdbId: externalIds.tmdbId,
        tvdbId: externalIds.tvdbId,
        imdbId: externalIds.imdbId,
      }
    })

    logger.debug("Fetched watchlist items", { count: items.length })
    return { success: true, data: items }
  } catch (error) {
    logger.error("Error fetching Plex watchlist", error)
    return { success: false, error: "Failed to fetch watchlist" }
  }
}

/**
 * Validate a user's Plex token is still valid
 * @param userToken User's Plex auth token
 */
export async function validatePlexToken(userToken: string): Promise<boolean> {
  try {
    const url = "https://plex.tv/api/v2/user"
    const response = await fetch(url, {
      method: "GET",
      headers: getPlexHeaders(userToken),
    })

    return response.ok
  } catch (error) {
    logger.debug("Error validating Plex token", { error })
    return false
  }
}
