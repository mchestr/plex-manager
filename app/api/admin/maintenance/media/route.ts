import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { getRadarrMovies } from "@/lib/connections/radarr"
import { getSonarrSeries } from "@/lib/connections/sonarr"
import { getTautulliLibraryMediaInfo, getTautulliLibraryNames } from "@/lib/connections/tautulli"
import { getPlexLibrarySections, getPlexLibraryItems, getPlexPlaylists, getPlexPlaylistItems } from "@/lib/connections/plex"
import { batchGetOverseerrMediaStatus } from "@/lib/connections/overseerr"
import type { RadarrParsed } from "@/lib/validations/radarr"
import type { SonarrParsed } from "@/lib/validations/sonarr"
import type { TautulliParsed } from "@/lib/validations/tautulli"
import type { OverseerrParsed } from "@/lib/validations/overseerr"
import { NextRequest, NextResponse } from "next/server"

export const dynamic = 'force-dynamic'

// Tautulli library media info response types
interface TautulliMediaItem {
  rating_key: string
  title: string
  year: number
  play_count: number | null
  last_played: number | null  // Unix timestamp
  added_at: number | null     // Unix timestamp
  file_size: number | null
  file: string | null
  duration: number | null     // milliseconds
  video_codec: string | null
  audio_codec: string | null
  video_resolution: string | null
  bitrate: number | null
  container: string | null
  video_full_resolution: string | null
  media_type: string
  grandparent_title?: string  // For episodes, this is the series title
}

interface RadarrMovie {
  id: number
  title: string
  year: number
  tmdbId?: number
  imdbId?: string
  hasFile: boolean
  monitored: boolean
  qualityProfileId: number
  minimumAvailability: string
  status: string
  added: string
  ratings?: {
    tmdb?: {
      value: number
    }
  }
  digitalRelease?: string
  inCinemas?: string
  runtime?: number
  tags?: number[]
  sizeOnDisk?: number
  certification?: string
  genres?: string[]
}

interface SonarrSeries {
  id: number
  title: string
  year: number
  tvdbId?: number
  imdbId?: string
  monitored: boolean
  status: string
  added: string
  seriesType: string
  network?: string
  firstAired?: string
  ended: boolean
  tags?: number[]
  statistics?: {
    seasonCount?: number
    totalEpisodeCount?: number
    episodeFileCount?: number
    episodeCount?: number
    sizeOnDisk?: number
    percentOfEpisodes?: number
  }
  certification?: string
  qualityProfileId: number
  genres?: string[]
}

// Plex library item from /library/sections/{id}/all
interface PlexMediaItem {
  ratingKey: string
  title: string
  year?: number
  type: string // 'movie' or 'show'
  viewCount?: number
  lastViewedAt?: number // Unix timestamp
  addedAt?: number // Unix timestamp
  thumb?: string
  audienceRating?: number
  contentRating?: string
  studio?: string
  duration?: number // milliseconds
  guid?: string // Plex GUID for external matching
  Guid?: Array<{ id: string }> // External GUIDs (tmdb://, imdb://, tvdb://)
}

// Overseerr status labels
const OVERSEERR_STATUS_LABELS: Record<number, string> = {
  1: 'unknown',
  2: 'pending',
  3: 'processing',
  4: 'partially_available',
  5: 'available',
}

/**
 * API route for fetching media from Radarr/Sonarr for rule testing.
 * Transforms raw API data into MediaItem format for client-side evaluation.
 */
export async function GET(request: NextRequest) {
  try {
    const rateLimitResponse = await adminRateLimiter(request)
    if (rateLimitResponse) {
      return rateLimitResponse
    }

    const authResult = await requireAdminAPI(request)
    if (authResult.response) {
      return authResult.response
    }

    const { searchParams } = new URL(request.url)
    const mediaType = searchParams.get('mediaType') || 'MOVIE'
    const search = searchParams.get('search') || ''
    const limit = parseInt(searchParams.get('limit') || '50', 10)

    if (mediaType === 'MOVIE') {
      return await fetchMovies(search, limit)
    } else if (mediaType === 'TV_SERIES') {
      return await fetchSeries(search, limit)
    } else {
      return NextResponse.json(
        createSafeError(ErrorCode.VALIDATION_ERROR, "Invalid media type"),
        { status: getStatusCode(ErrorCode.VALIDATION_ERROR) }
      )
    }
  } catch (error) {
    logError("MAINTENANCE_MEDIA_API", error)
    return NextResponse.json(
      createSafeError(ErrorCode.INTERNAL_ERROR, "Failed to fetch media"),
      { status: getStatusCode(ErrorCode.INTERNAL_ERROR) }
    )
  }
}

async function fetchMovies(search: string, limit: number) {
  // Get the first active Radarr server
  const radarr = await prisma.radarr.findFirst({
    where: { isActive: true },
  })

  if (!radarr) {
    return NextResponse.json({ items: [], error: "No active Radarr server configured" })
  }

  const radarrConfig: RadarrParsed = {
    url: radarr.url,
    apiKey: radarr.apiKey,
    name: radarr.name,
  }

  const result = await getRadarrMovies(radarrConfig)
  if (!result.success) {
    return NextResponse.json({ items: [], error: result.error })
  }
  if (!result.data) {
    return NextResponse.json({ items: [], error: 'No data returned from Radarr' })
  }

  const movies = result.data as RadarrMovie[]

  // Fetch additional service data in parallel
  const [tautulliData, plexData, overseerrData, playlistMap] = await Promise.all([
    fetchTautulliMovieData(),
    fetchPlexMovieData(),
    fetchOverseerrMovieData(movies.filter(m => m.tmdbId).map(m => m.tmdbId!)),
    fetchPlexPlaylistMap(),
  ])

  // Filter by search term if provided
  let filtered = movies
  if (search) {
    const searchLower = search.toLowerCase()
    filtered = movies.filter(movie =>
      movie.title.toLowerCase().includes(searchLower)
    )
  }

  // Log matching stats
  if (tautulliData.length > 0) {
    console.log(`[Matching] Attempting to match ${filtered.length} Radarr movies with ${tautulliData.length} Tautulli items`)
  }

  // Transform to MediaItem format and limit results
  const items = filtered.slice(0, limit).map(movie => {
    // Match with Tautulli data by title + year (with some flexibility)
    const normalizedMovieTitle = normalizeTitle(movie.title)
    const tautulliItem = tautulliData.find(t => {
      const normalizedTautulliTitle = normalizeTitle(t.title)
      const titleMatch = normalizedTautulliTitle === normalizedMovieTitle
      const yearMatch = t.year === movie.year || Math.abs((t.year || 0) - (movie.year || 0)) <= 1

      return titleMatch && yearMatch
    })

    // Match with Plex data by title + year
    const plexItem = plexData.find(p => {
      const normalizedPlexTitle = normalizeTitle(p.title)
      const titleMatch = normalizedPlexTitle === normalizedMovieTitle
      const yearMatch = p.year === movie.year || Math.abs((p.year || 0) - (movie.year || 0)) <= 1
      return titleMatch && yearMatch
    })

    // Get Overseerr data by TMDB ID
    const overseerrItem = movie.tmdbId ? overseerrData.get(`movie_${movie.tmdbId}`) : undefined

    // Debug: log unmatched movies that have files (should be in Plex)
    if (!tautulliItem && movie.hasFile && tautulliData.length > 0) {
      // Try to find close matches for debugging
      const closeMatches = tautulliData
        .filter(t => normalizeTitle(t.title).includes(normalizedMovieTitle.slice(0, 10)) ||
                     normalizedMovieTitle.includes(normalizeTitle(t.title).slice(0, 10)))
        .slice(0, 3)

      if (closeMatches.length > 0) {
        console.log(`[Matching] No exact match for "${movie.title}" (${movie.year}). Close matches:`,
          closeMatches.map(t => `"${t.title}" (${t.year})`))
      }
    }

    return {
      // === Core Identification ===
      id: String(movie.id),
      title: movie.title,
      year: movie.year,
      mediaType: 'MOVIE' as const,
      genres: movie.genres || [],

      // === Plex Data (Direct from Plex server) ===
      plex: plexItem ? {
        ratingKey: plexItem.ratingKey,
        viewCount: plexItem.viewCount ?? 0,
        lastViewedAt: plexItem.lastViewedAt
          ? new Date(plexItem.lastViewedAt * 1000)
          : null,
        addedAt: plexItem.addedAt
          ? new Date(plexItem.addedAt * 1000)
          : null,
        thumb: plexItem.thumb ?? null,
        audienceRating: plexItem.audienceRating ?? null,
        contentRating: plexItem.contentRating ?? null,
        studio: plexItem.studio ?? null,
        duration: plexItem.duration ?? null,
        guid: plexItem.guid ?? null,
        playlists: playlistMap.get(plexItem.ratingKey) || [],
      } : null,

      // === Tautulli Data (Plex playback, file info, quality) ===
      // Will be null/empty if movie is not in Plex (e.g., hasFile: false)
      tautulli: tautulliItem ? {
        plexRatingKey: tautulliItem.rating_key,
        // Playback
        playCount: tautulliItem.play_count ?? 0,
        lastWatchedAt: tautulliItem.last_played
          ? new Date(tautulliItem.last_played * 1000)
          : null,
        addedAt: tautulliItem.added_at
          ? new Date(tautulliItem.added_at * 1000)
          : null,
        // File info
        fileSize: tautulliItem.file_size ?? null,
        filePath: tautulliItem.file ?? null,
        duration: tautulliItem.duration
          ? Math.round(tautulliItem.duration / 60000)
          : null,
        // Quality/Technical
        videoCodec: tautulliItem.video_codec ?? null,
        audioCodec: tautulliItem.audio_codec ?? null,
        resolution: tautulliItem.video_resolution ?? null,
        bitrate: tautulliItem.bitrate ?? null,
        container: tautulliItem.container ?? null,
      } : null,

      // === Radarr Data (Movie management) ===
      radarr: {
        hasFile: movie.hasFile,
        monitored: movie.monitored,
        qualityProfileId: movie.qualityProfileId,
        minimumAvailability: movie.minimumAvailability,
        status: movie.status,
        tmdbRating: movie.ratings?.tmdb?.value ?? null,
        digitalRelease: movie.digitalRelease ? new Date(movie.digitalRelease) : null,
        inCinemas: movie.inCinemas ? new Date(movie.inCinemas) : null,
        runtime: movie.runtime ?? null,
        tags: movie.tags || [],
        sizeOnDisk: movie.sizeOnDisk ?? 0,
        addedAt: movie.added ? new Date(movie.added) : null,
        tmdbId: movie.tmdbId ?? null,
        imdbId: movie.imdbId ?? null,
      },

      // === Overseerr Data (Request status) ===
      overseerr: overseerrItem ? {
        mediaStatus: overseerrItem.status,
        status: OVERSEERR_STATUS_LABELS[overseerrItem.status] || 'unknown',
        hasRequest: overseerrItem.hasRequest,
        requestedBy: overseerrItem.requestedBy ?? null,
        requestedAt: overseerrItem.requestedAt ?? null,
        isRequested: overseerrItem.hasRequest,
        requestCount: overseerrItem.requestCount,
        tmdbId: movie.tmdbId ?? null,
      } : null,

      // === Computed/Convenience Fields ===
      // These pull from the best available source
      playCount: tautulliItem?.play_count ?? plexItem?.viewCount ?? 0,
      lastWatchedAt: tautulliItem?.last_played
        ? new Date(tautulliItem.last_played * 1000)
        : (plexItem?.lastViewedAt ? new Date(plexItem.lastViewedAt * 1000) : null),
      addedAt: tautulliItem?.added_at
        ? new Date(tautulliItem.added_at * 1000)
        : (plexItem?.addedAt ? new Date(plexItem.addedAt * 1000) : (movie.added ? new Date(movie.added) : null)),
    }
  })

  return NextResponse.json({ items })
}

/**
 * Normalize title for matching between Radarr and Tautulli
 */
function normalizeTitle(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^\w\s]/g, '') // Remove punctuation
    .replace(/\s+/g, ' ')    // Normalize whitespace
    .trim()
}

/**
 * Fetch movie data from Tautulli for playback/file/quality info
 */
async function fetchTautulliMovieData(): Promise<TautulliMediaItem[]> {
  try {
    // Get Tautulli configuration
    const tautulli = await prisma.tautulli.findFirst({
      where: { isActive: true },
    })

    if (!tautulli) {
      console.log('[Tautulli] No active Tautulli server configured')
      return []
    }

    const tautulliConfig: TautulliParsed = {
      url: tautulli.url,
      apiKey: tautulli.apiKey,
      name: tautulli.name,
    }

    // Get library names to find movie libraries
    const librariesResult = await getTautulliLibraryNames(tautulliConfig)
    if (!librariesResult.success) {
      console.log('[Tautulli] Failed to get library names:', librariesResult.error)
      return []
    }
    if (!librariesResult.data) {
      console.log('[Tautulli] No library data returned')
      return []
    }

     
    const libraries = (librariesResult.data as any)?.response?.data || []
    console.log('[Tautulli] Found libraries:', libraries.map((l: { section_name: string; section_type: string; section_id: string }) =>
      `${l.section_name} (${l.section_type}, id=${l.section_id})`
    ))

     
    const movieLibraries = libraries.filter((lib: any) => lib.section_type === 'movie')

    if (movieLibraries.length === 0) {
      console.log('[Tautulli] No movie libraries found')
      return []
    }

    // Fetch media info from all movie libraries
    const allMedia: TautulliMediaItem[] = []

    for (const library of movieLibraries) {
      console.log(`[Tautulli] Fetching media from library: ${library.section_name} (id=${library.section_id})`)

      const mediaResult = await getTautulliLibraryMediaInfo(tautulliConfig, library.section_id, {
        length: 10000, // Get all items
      })

      if (!mediaResult.success) {
        console.log(`[Tautulli] Failed to fetch from ${library.section_name}:`, mediaResult.error)
        continue
      }
      if (mediaResult.data) {
        const responseData = (mediaResult.data as any)?.response?.data
        const items = responseData?.data || []
        console.log(`[Tautulli] Got ${items.length} items from ${library.section_name}`)

        // Log first item structure for debugging
        if (items.length > 0) {
          console.log('[Tautulli] Sample item keys:', Object.keys(items[0]))
          console.log('[Tautulli] Sample item:', JSON.stringify(items[0], null, 2).slice(0, 500))
        }

        allMedia.push(...items)
      }
    }

    console.log(`[Tautulli] Total movies fetched: ${allMedia.length}`)
    return allMedia
  } catch (error) {
    logError("TAUTULLI_FETCH", error)
    return []
  }
}

/**
 * Fetch movie data from Plex directly
 */
async function fetchPlexMovieData(): Promise<PlexMediaItem[]> {
  try {
    const plex = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plex) {
      console.log('[Plex] No active Plex server configured')
      return []
    }

    const plexConfig = {
      url: plex.url,
      token: plex.token,
    }

    // Get library sections first
    const sectionsResult = await getPlexLibrarySections(plexConfig)
    if (!sectionsResult.success || !sectionsResult.data) {
      console.log('[Plex] Failed to get library sections:', sectionsResult.error)
      return []
    }

    const sections = sectionsResult.data?.MediaContainer?.Directory || []
    const movieSections = sections.filter((s: { type: string }) => s.type === 'movie')

    if (movieSections.length === 0) {
      console.log('[Plex] No movie libraries found')
      return []
    }

    const allMedia: PlexMediaItem[] = []

    for (const section of movieSections) {
      console.log(`[Plex] Fetching movies from library: ${section.title} (key=${section.key})`)

      const itemsResult = await getPlexLibraryItems(plexConfig, section.key, 1) // type 1 = movie
      if (!itemsResult.success || !itemsResult.data) {
        console.log(`[Plex] Failed to fetch from ${section.title}:`, itemsResult.error)
        continue
      }

      const items = itemsResult.data?.MediaContainer?.Metadata || []
      console.log(`[Plex] Got ${items.length} movies from ${section.title}`)

      allMedia.push(...items)
    }

    console.log(`[Plex] Total movies fetched: ${allMedia.length}`)
    return allMedia
  } catch (error) {
    logError("PLEX_FETCH", error)
    return []
  }
}

/**
 * Fetch TV series data from Plex directly
 */
async function fetchPlexSeriesData(): Promise<PlexMediaItem[]> {
  try {
    const plex = await prisma.plexServer.findFirst({
      where: { isActive: true },
    })

    if (!plex) {
      return []
    }

    const plexConfig = {
      url: plex.url,
      token: plex.token,
    }

    const sectionsResult = await getPlexLibrarySections(plexConfig)
    if (!sectionsResult.success || !sectionsResult.data) {
      return []
    }

    const sections = sectionsResult.data?.MediaContainer?.Directory || []
    const tvSections = sections.filter((s: { type: string }) => s.type === 'show')

    if (tvSections.length === 0) {
      return []
    }

    const allMedia: PlexMediaItem[] = []

    for (const section of tvSections) {
      const itemsResult = await getPlexLibraryItems(plexConfig, section.key, 2) // type 2 = show
      if (itemsResult.success && itemsResult.data) {
        const items = itemsResult.data?.MediaContainer?.Metadata || []
        allMedia.push(...items)
      }
    }

    return allMedia
  } catch (error) {
    logError("PLEX_FETCH_SERIES", error)
    return []
  }
}

/**
 * Fetch Overseerr status for movies by TMDB IDs
 */
async function fetchOverseerrMovieData(tmdbIds: number[]): Promise<Map<string, {
  status: number
  hasRequest: boolean
  requestedBy?: string
  requestedAt?: Date
  requestCount: number
}>> {
  try {
    const overseerr = await prisma.overseerr.findFirst({
      where: { isActive: true },
    })

    if (!overseerr || tmdbIds.length === 0) {
      return new Map()
    }

    const overseerrConfig: OverseerrParsed = {
      url: overseerr.url,
      apiKey: overseerr.apiKey,
      name: overseerr.name,
    }

    const items = tmdbIds.map(tmdbId => ({ tmdbId, mediaType: 'movie' as const }))
    return await batchGetOverseerrMediaStatus(overseerrConfig, items)
  } catch (error) {
    logError("OVERSEERR_FETCH", error)
    return new Map()
  }
}

/**
 * Fetch Plex playlists and build a map of ratingKey -> playlist names
 * This allows us to know which playlists each media item belongs to
 */
async function fetchPlexPlaylistMap(): Promise<Map<string, string[]>> {
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

    // Get all playlists
    const playlistsResult = await getPlexPlaylists(plexConfig)
    if (!playlistsResult.success || !playlistsResult.data) {
      return playlistMap
    }

    const playlists = playlistsResult.data?.MediaContainer?.Metadata || []
    console.log(`[Plex] Found ${playlists.length} playlists`)

    // For each playlist, get its items and map ratingKeys to playlist names
    for (const playlist of playlists) {
      // Only process video playlists (skip audio playlists)
      if (playlist.playlistType !== 'video') {
        continue
      }

      const itemsResult = await getPlexPlaylistItems(plexConfig, playlist.ratingKey)
      if (!itemsResult.success || !itemsResult.data) {
        continue
      }

      const items = itemsResult.data?.MediaContainer?.Metadata || []
      for (const item of items) {
        const ratingKey = item.ratingKey
        if (ratingKey) {
          const existing = playlistMap.get(ratingKey) || []
          if (!existing.includes(playlist.title)) {
            existing.push(playlist.title)
            playlistMap.set(ratingKey, existing)
          }
        }
      }
    }

    console.log(`[Plex] Built playlist map with ${playlistMap.size} media items`)
    return playlistMap
  } catch (error) {
    logError("PLEX_PLAYLIST_FETCH", error)
    return playlistMap
  }
}

async function fetchSeries(search: string, limit: number) {
  // Get the first active Sonarr server
  const sonarr = await prisma.sonarr.findFirst({
    where: { isActive: true },
  })

  if (!sonarr) {
    return NextResponse.json({ items: [], error: "No active Sonarr server configured" })
  }

  const sonarrConfig: SonarrParsed = {
    url: sonarr.url,
    apiKey: sonarr.apiKey,
    name: sonarr.name,
  }

  const result = await getSonarrSeries(sonarrConfig)
  if (!result.success) {
    return NextResponse.json({ items: [], error: result.error })
  }
  if (!result.data) {
    return NextResponse.json({ items: [], error: 'No data returned from Sonarr' })
  }

  const series = result.data as SonarrSeries[]

  // Fetch additional service data in parallel
  const [tautulliData, plexData, playlistMap] = await Promise.all([
    fetchTautulliSeriesData(),
    fetchPlexSeriesData(),
    fetchPlexPlaylistMap(),
  ])

  // Filter by search term if provided
  let filtered = series
  if (search) {
    const searchLower = search.toLowerCase()
    filtered = series.filter(s =>
      s.title.toLowerCase().includes(searchLower)
    )
  }

  // Transform to MediaItem format and limit results
  const items = filtered.slice(0, limit).map(s => {
    const normalizedSeriesTitle = normalizeTitle(s.title)

    // Match with Tautulli data by title + year
    const tautulliItem = tautulliData.find(t =>
      normalizeTitle(t.title) === normalizedSeriesTitle &&
      Math.abs(t.year - s.year) <= 1 // Allow 1 year tolerance for TV shows
    )

    // Match with Plex data by title + year
    const plexItem = plexData.find(p => {
      const normalizedPlexTitle = normalizeTitle(p.title)
      const titleMatch = normalizedPlexTitle === normalizedSeriesTitle
      const yearMatch = p.year === s.year || Math.abs((p.year || 0) - (s.year || 0)) <= 1
      return titleMatch && yearMatch
    })

    return {
      // === Core Identification ===
      id: String(s.id),
      title: s.title,
      year: s.year,
      mediaType: 'TV_SERIES' as const,
      genres: s.genres || [],

      // === Plex Data (Direct from Plex server) ===
      plex: plexItem ? {
        ratingKey: plexItem.ratingKey,
        viewCount: plexItem.viewCount ?? 0,
        lastViewedAt: plexItem.lastViewedAt
          ? new Date(plexItem.lastViewedAt * 1000)
          : null,
        addedAt: plexItem.addedAt
          ? new Date(plexItem.addedAt * 1000)
          : null,
        thumb: plexItem.thumb ?? null,
        audienceRating: plexItem.audienceRating ?? null,
        contentRating: plexItem.contentRating ?? null,
        studio: plexItem.studio ?? null,
        duration: plexItem.duration ?? null,
        guid: plexItem.guid ?? null,
        playlists: playlistMap.get(plexItem.ratingKey) || [],
      } : null,

      // === Tautulli Data (Plex playback, file info, quality) ===
      // Will be null if series is not in Plex
      tautulli: tautulliItem ? {
        plexRatingKey: tautulliItem.rating_key,
        // Playback
        playCount: tautulliItem.play_count ?? 0,
        lastWatchedAt: tautulliItem.last_played
          ? new Date(tautulliItem.last_played * 1000)
          : null,
        addedAt: tautulliItem.added_at
          ? new Date(tautulliItem.added_at * 1000)
          : null,
        // File info (from most recent episode typically)
        fileSize: tautulliItem.file_size ?? null,
        filePath: tautulliItem.file ?? null,
        duration: tautulliItem.duration
          ? Math.round(tautulliItem.duration / 60000)
          : null,
        // Quality/Technical
        videoCodec: tautulliItem.video_codec ?? null,
        audioCodec: tautulliItem.audio_codec ?? null,
        resolution: tautulliItem.video_resolution ?? null,
        bitrate: tautulliItem.bitrate ?? null,
        container: tautulliItem.container ?? null,
      } : null,

      // === Sonarr Data (Series management) ===
      sonarr: {
        monitored: s.monitored,
        status: s.status,
        seriesType: s.seriesType,
        network: s.network ?? null,
        seasonCount: s.statistics?.seasonCount ?? 0,
        totalEpisodeCount: s.statistics?.totalEpisodeCount ?? 0,
        episodeFileCount: s.statistics?.episodeFileCount ?? 0,
        percentOfEpisodes: s.statistics?.percentOfEpisodes ?? null,
        firstAired: s.firstAired ? new Date(s.firstAired) : null,
        ended: s.ended,
        tags: s.tags || [],
        sizeOnDisk: s.statistics?.sizeOnDisk ?? 0,
        certification: s.certification ?? null,
        qualityProfileId: s.qualityProfileId,
        addedAt: s.added ? new Date(s.added) : null,
        tvdbId: s.tvdbId ?? null,
        imdbId: s.imdbId ?? null,
      },

      // === Computed/Convenience Fields ===
      playCount: tautulliItem?.play_count ?? plexItem?.viewCount ?? 0,
      lastWatchedAt: tautulliItem?.last_played
        ? new Date(tautulliItem.last_played * 1000)
        : (plexItem?.lastViewedAt ? new Date(plexItem.lastViewedAt * 1000) : null),
      addedAt: tautulliItem?.added_at
        ? new Date(tautulliItem.added_at * 1000)
        : (plexItem?.addedAt ? new Date(plexItem.addedAt * 1000) : (s.added ? new Date(s.added) : null)),
    }
  })

  return NextResponse.json({ items })
}

/**
 * Fetch TV series data from Tautulli for playback info
 */
async function fetchTautulliSeriesData(): Promise<TautulliMediaItem[]> {
  try {
    const tautulli = await prisma.tautulli.findFirst({
      where: { isActive: true },
    })

    if (!tautulli) {
      return []
    }

    const tautulliConfig: TautulliParsed = {
      url: tautulli.url,
      apiKey: tautulli.apiKey,
      name: tautulli.name,
    }

    // Get library names to find TV show libraries
    const librariesResult = await getTautulliLibraryNames(tautulliConfig)
    if (!librariesResult.success) {
      return []
    }
    if (!librariesResult.data) {
      return []
    }

     
    const libraries = (librariesResult.data as any)?.response?.data || []
     
    const tvLibraries = libraries.filter((lib: any) => lib.section_type === 'show')

    if (tvLibraries.length === 0) {
      return []
    }

    // Fetch media info from all TV libraries
    const allMedia: TautulliMediaItem[] = []

    for (const library of tvLibraries) {
      const mediaResult = await getTautulliLibraryMediaInfo(tautulliConfig, library.section_id, {
        length: 10000,
      })

      if (mediaResult.success && mediaResult.data) {
         
        const items = (mediaResult.data as any)?.response?.data?.data || []
        allMedia.push(...items)
      }
    }

    return allMedia
  } catch (error) {
    logError("TAUTULLI_FETCH_SERIES", error)
    return []
  }
}
