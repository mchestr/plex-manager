/**
 * API route for fetching media from Radarr/Sonarr for rule testing.
 * Transforms raw API data into MediaItem format for client-side evaluation.
 */

import { prisma } from "@/lib/prisma"
import { requireAdminAPI } from "@/lib/security/api-helpers"
import { createSafeError, ErrorCode, getStatusCode, logError } from "@/lib/security/error-handler"
import { adminRateLimiter } from "@/lib/security/rate-limit"
import { getRadarrMovies } from "@/lib/connections/radarr"
import { getSonarrSeries } from "@/lib/connections/sonarr"
import { NextRequest, NextResponse } from "next/server"
import type { RadarrParsed } from "@/lib/validations/radarr"
import type { SonarrParsed } from "@/lib/validations/sonarr"

import {
  type RadarrMovie,
  type SonarrSeries,
  OVERSEERR_STATUS_LABELS,
  fetchTautulliMovieData,
  fetchTautulliSeriesData,
  fetchPlexMovieData,
  fetchPlexSeriesData,
  fetchPlexPlaylistMap,
  fetchOverseerrMovieData,
  findTautulliMatch,
  findPlexMatch,
} from "@/lib/maintenance/services"

export const dynamic = "force-dynamic"

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
    const mediaType = searchParams.get("mediaType") || "MOVIE"
    const search = searchParams.get("search") || ""
    const limit = parseInt(searchParams.get("limit") || "50", 10)

    if (mediaType === "MOVIE") {
      return await fetchMovies(search, limit)
    } else if (mediaType === "TV_SERIES") {
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
    return NextResponse.json({ items: [], error: "No data returned from Radarr" })
  }

  const movies = result.data as RadarrMovie[]

  // Fetch additional service data in parallel
  const [tautulliData, plexData, overseerrData, playlistMap] = await Promise.all([
    fetchTautulliMovieData(),
    fetchPlexMovieData(),
    fetchOverseerrMovieData(movies.filter((m) => m.tmdbId).map((m) => m.tmdbId!)),
    fetchPlexPlaylistMap(),
  ])

  // Filter by search term if provided
  let filtered = movies
  if (search) {
    const searchLower = search.toLowerCase()
    filtered = movies.filter((movie) => movie.title.toLowerCase().includes(searchLower))
  }

  // Transform to MediaItem format and limit results
  const items = filtered.slice(0, limit).map((movie) => {
    const tautulliItem = findTautulliMatch(movie, tautulliData)
    const plexItem = findPlexMatch(movie, plexData)
    const overseerrItem = movie.tmdbId ? overseerrData.get(`movie_${movie.tmdbId}`) : undefined

    return transformMovieToMediaItem(movie, tautulliItem, plexItem, overseerrItem, playlistMap)
  })

  return NextResponse.json({ items })
}

async function fetchSeries(search: string, limit: number) {
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
    return NextResponse.json({ items: [], error: "No data returned from Sonarr" })
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
    filtered = series.filter((s) => s.title.toLowerCase().includes(searchLower))
  }

  // Transform to MediaItem format and limit results
  const items = filtered.slice(0, limit).map((s) => {
    const tautulliItem = findTautulliMatch(s, tautulliData)
    const plexItem = findPlexMatch(s, plexData)

    return transformSeriesToMediaItem(s, tautulliItem, plexItem, playlistMap)
  })

  return NextResponse.json({ items })
}

function transformMovieToMediaItem(
  movie: RadarrMovie,
  tautulliItem: any,
  plexItem: any,
  overseerrItem: any,
  playlistMap: Map<string, string[]>
) {
  return {
    id: String(movie.id),
    title: movie.title,
    year: movie.year,
    mediaType: "MOVIE" as const,
    genres: movie.genres || [],

    plex: plexItem
      ? {
          ratingKey: plexItem.ratingKey,
          viewCount: plexItem.viewCount ?? 0,
          lastViewedAt: plexItem.lastViewedAt ? new Date(plexItem.lastViewedAt * 1000) : null,
          addedAt: plexItem.addedAt ? new Date(plexItem.addedAt * 1000) : null,
          thumb: plexItem.thumb ?? null,
          audienceRating: plexItem.audienceRating ?? null,
          contentRating: plexItem.contentRating ?? null,
          studio: plexItem.studio ?? null,
          duration: plexItem.duration ?? null,
          guid: plexItem.guid ?? null,
          playlists: playlistMap.get(plexItem.ratingKey) || [],
        }
      : null,

    tautulli: tautulliItem
      ? {
          plexRatingKey: tautulliItem.rating_key,
          playCount: tautulliItem.play_count ?? 0,
          lastWatchedAt: tautulliItem.last_played ? new Date(tautulliItem.last_played * 1000) : null,
          addedAt: tautulliItem.added_at ? new Date(tautulliItem.added_at * 1000) : null,
          fileSize: tautulliItem.file_size ?? null,
          filePath: tautulliItem.file ?? null,
          duration: tautulliItem.duration ? Math.round(tautulliItem.duration / 60000) : null,
          videoCodec: tautulliItem.video_codec ?? null,
          audioCodec: tautulliItem.audio_codec ?? null,
          resolution: tautulliItem.video_resolution ?? null,
          bitrate: tautulliItem.bitrate ?? null,
          container: tautulliItem.container ?? null,
        }
      : null,

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

    overseerr: overseerrItem
      ? {
          mediaStatus: overseerrItem.status,
          status: OVERSEERR_STATUS_LABELS[overseerrItem.status] || "unknown",
          hasRequest: overseerrItem.hasRequest,
          requestedBy: overseerrItem.requestedBy ?? null,
          requestedAt: overseerrItem.requestedAt ?? null,
          isRequested: overseerrItem.hasRequest,
          requestCount: overseerrItem.requestCount,
          tmdbId: movie.tmdbId ?? null,
        }
      : null,

    playCount: tautulliItem?.play_count ?? plexItem?.viewCount ?? 0,
    lastWatchedAt: tautulliItem?.last_played
      ? new Date(tautulliItem.last_played * 1000)
      : plexItem?.lastViewedAt
        ? new Date(plexItem.lastViewedAt * 1000)
        : null,
    addedAt: tautulliItem?.added_at
      ? new Date(tautulliItem.added_at * 1000)
      : plexItem?.addedAt
        ? new Date(plexItem.addedAt * 1000)
        : movie.added
          ? new Date(movie.added)
          : null,
  }
}

function transformSeriesToMediaItem(
  series: SonarrSeries,
  tautulliItem: any,
  plexItem: any,
  playlistMap: Map<string, string[]>
) {
  return {
    id: String(series.id),
    title: series.title,
    year: series.year,
    mediaType: "TV_SERIES" as const,
    genres: series.genres || [],

    plex: plexItem
      ? {
          ratingKey: plexItem.ratingKey,
          viewCount: plexItem.viewCount ?? 0,
          lastViewedAt: plexItem.lastViewedAt ? new Date(plexItem.lastViewedAt * 1000) : null,
          addedAt: plexItem.addedAt ? new Date(plexItem.addedAt * 1000) : null,
          thumb: plexItem.thumb ?? null,
          audienceRating: plexItem.audienceRating ?? null,
          contentRating: plexItem.contentRating ?? null,
          studio: plexItem.studio ?? null,
          duration: plexItem.duration ?? null,
          guid: plexItem.guid ?? null,
          playlists: playlistMap.get(plexItem.ratingKey) || [],
        }
      : null,

    tautulli: tautulliItem
      ? {
          plexRatingKey: tautulliItem.rating_key,
          playCount: tautulliItem.play_count ?? 0,
          lastWatchedAt: tautulliItem.last_played ? new Date(tautulliItem.last_played * 1000) : null,
          addedAt: tautulliItem.added_at ? new Date(tautulliItem.added_at * 1000) : null,
          fileSize: tautulliItem.file_size ?? null,
          filePath: tautulliItem.file ?? null,
          duration: tautulliItem.duration ? Math.round(tautulliItem.duration / 60000) : null,
          videoCodec: tautulliItem.video_codec ?? null,
          audioCodec: tautulliItem.audio_codec ?? null,
          resolution: tautulliItem.video_resolution ?? null,
          bitrate: tautulliItem.bitrate ?? null,
          container: tautulliItem.container ?? null,
        }
      : null,

    sonarr: {
      monitored: series.monitored,
      status: series.status,
      seriesType: series.seriesType,
      network: series.network ?? null,
      seasonCount: series.statistics?.seasonCount ?? 0,
      totalEpisodeCount: series.statistics?.totalEpisodeCount ?? 0,
      episodeFileCount: series.statistics?.episodeFileCount ?? 0,
      percentOfEpisodes: series.statistics?.percentOfEpisodes ?? null,
      firstAired: series.firstAired ? new Date(series.firstAired) : null,
      ended: series.ended,
      tags: series.tags || [],
      sizeOnDisk: series.statistics?.sizeOnDisk ?? 0,
      certification: series.certification ?? null,
      qualityProfileId: series.qualityProfileId,
      addedAt: series.added ? new Date(series.added) : null,
      tvdbId: series.tvdbId ?? null,
      imdbId: series.imdbId ?? null,
    },

    playCount: tautulliItem?.play_count ?? plexItem?.viewCount ?? 0,
    lastWatchedAt: tautulliItem?.last_played
      ? new Date(tautulliItem.last_played * 1000)
      : plexItem?.lastViewedAt
        ? new Date(plexItem.lastViewedAt * 1000)
        : null,
    addedAt: tautulliItem?.added_at
      ? new Date(tautulliItem.added_at * 1000)
      : plexItem?.addedAt
        ? new Date(plexItem.addedAt * 1000)
        : series.added
          ? new Date(series.added)
          : null,
  }
}
