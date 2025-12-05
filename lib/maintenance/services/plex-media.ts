/**
 * Plex media fetching service for maintenance rules
 */

import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { getPlexLibrarySections, getPlexLibraryItems, getPlexPlaylists, getPlexPlaylistItems } from "@/lib/connections/plex"
import type { PlexMediaItem } from "./types"

const logger = createLogger("plex-media")

interface PlexSection {
  key: string
  title: string
  type: string
}

interface PlexPlaylist {
  ratingKey: string
  title: string
  playlistType: string
}

interface PlexPlaylistItem {
  ratingKey: string
}

/**
 * Fetch movie data from Plex directly
 */
export async function fetchPlexMovieData(): Promise<PlexMediaItem[]> {
  return fetchPlexMediaByType("movie", 1)
}

/**
 * Fetch TV series data from Plex directly
 */
export async function fetchPlexSeriesData(): Promise<PlexMediaItem[]> {
  return fetchPlexMediaByType("show", 2)
}

/**
 * Fetch media data from Plex by library type
 */
async function fetchPlexMediaByType(sectionType: string, mediaType: number): Promise<PlexMediaItem[]> {
  try {
    const plex = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plex) {
      logger.debug("No active Plex server configured")
      return []
    }

    const plexConfig = {
      url: plex.url,
      token: plex.token,
    }

    const sectionsResult = await getPlexLibrarySections(plexConfig)
    if (!sectionsResult.success || !sectionsResult.data) {
      logger.debug("Failed to get library sections", { error: sectionsResult.error })
      return []
    }

    const sections: PlexSection[] = sectionsResult.data?.MediaContainer?.Directory || []
    const filteredSections = sections.filter((s) => s.type === sectionType)

    if (filteredSections.length === 0) {
      logger.debug(`No ${sectionType} libraries found`)
      return []
    }

    const allMedia: PlexMediaItem[] = []

    for (const section of filteredSections) {
      const itemsResult = await getPlexLibraryItems(plexConfig, section.key, mediaType)
      if (itemsResult.success && itemsResult.data) {
        const items: PlexMediaItem[] = itemsResult.data?.MediaContainer?.Metadata || []
        allMedia.push(...items)
      }
    }

    logger.debug(`Fetched ${allMedia.length} ${sectionType} items from Plex`)
    return allMedia
  } catch (error) {
    logger.error(`Failed to fetch ${sectionType} data from Plex`, { error })
    return []
  }
}

/**
 * Fetch Plex playlists and build a map of ratingKey -> playlist names
 * This allows us to know which playlists each media item belongs to
 *
 * Note: This makes sequential API calls for each playlist. For servers with
 * many playlists, this could be slow. Consider caching if performance is an issue.
 */
export async function fetchPlexPlaylistMap(): Promise<Map<string, string[]>> {
  const playlistMap = new Map<string, string[]>()

  try {
    const plex = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plex) {
      return playlistMap
    }

    const plexConfig = {
      url: plex.url,
      token: plex.token,
    }

    const playlistsResult = await getPlexPlaylists(plexConfig)
    if (!playlistsResult.success || !playlistsResult.data) {
      return playlistMap
    }

    const playlists: PlexPlaylist[] = playlistsResult.data?.MediaContainer?.Metadata || []
    logger.debug(`Found ${playlists.length} playlists`)

    // For each video playlist, get items and map ratingKeys to playlist names
    for (const playlist of playlists) {
      if (playlist.playlistType !== "video") {
        continue
      }

      const itemsResult = await getPlexPlaylistItems(plexConfig, playlist.ratingKey)
      if (!itemsResult.success || !itemsResult.data) {
        continue
      }

      const items: PlexPlaylistItem[] = itemsResult.data?.MediaContainer?.Metadata || []
      for (const item of items) {
        if (item.ratingKey) {
          const existing = playlistMap.get(item.ratingKey) || []
          if (!existing.includes(playlist.title)) {
            existing.push(playlist.title)
            playlistMap.set(item.ratingKey, existing)
          }
        }
      }
    }

    logger.debug(`Built playlist map with ${playlistMap.size} media items`)
    return playlistMap
  } catch (error) {
    logger.error("Failed to fetch playlist data from Plex", { error })
    return playlistMap
  }
}
