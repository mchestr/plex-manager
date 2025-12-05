/**
 * Shared types for maintenance media services
 */

// Tautulli library media info response types
export interface TautulliMediaItem {
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

export interface RadarrMovie {
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

export interface SonarrSeries {
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
export interface PlexMediaItem {
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

export interface OverseerrMediaStatus {
  status: number
  hasRequest: boolean
  requestedBy?: string
  requestedAt?: Date
  requestCount: number
}

// Overseerr status labels
export const OVERSEERR_STATUS_LABELS: Record<number, string> = {
  1: 'unknown',
  2: 'pending',
  3: 'processing',
  4: 'partially_available',
  5: 'available',
}
