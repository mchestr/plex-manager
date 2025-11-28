/**
 * Field Registry for Maintenance Rules
 *
 * Centralized definition of all available fields from multiple data sources
 * with metadata for UI generation, validation, and evaluation.
 *
 * **Data Sources:**
 * - Tautulli: Playback statistics, watch history, file metadata, and media information
 *   (API: get_library_media_info endpoint)
 * - Plex: Media metadata via Tautulli (ratings, genres, library organization)
 * - Radarr: Movie monitoring status, quality profiles, file availability
 *   (API: /api/v3/movie endpoint)
 * - Sonarr: Series monitoring status, episode counts, series status
 *   (API: /api/v3/series endpoint)
 *
 * **Field Naming Convention:**
 * - Direct fields: `fieldName` (e.g., `playCount`, `title`)
 * - Nested fields: `service.field` (e.g., `radarr.monitored`, `sonarr.status`)
 *
 * **Adding New Fields:**
 * 1. Add to FIELD_DEFINITIONS array with required properties
 * 2. Document source API endpoint and field mapping in comments
 * 3. Update scanner to fetch this data (lib/maintenance/scanner.ts)
 * 4. Update MediaItem interface in rule-evaluator.ts if needed
 * 5. Add validation schema if applicable
 *
 * **Data Refresh:**
 * - Tautulli data: Fetched on-demand during maintenance scans
 * - Radarr/Sonarr data: Fetched if integration is configured, otherwise null
 * - All data cached per scan execution
 */

import { MediaType } from "@/lib/validations/maintenance"

// Field type definitions
export type FieldType = 'string' | 'number' | 'date' | 'boolean' | 'array' | 'enum'
export type DataSource = 'plex' | 'tautulli' | 'radarr' | 'sonarr'

// Comparison operators by field type
export type StringOperator = 'equals' | 'notEquals' | 'contains' | 'notContains' | 'startsWith' | 'endsWith' | 'regex' | 'in' | 'notIn'
export type NumberOperator = 'equals' | 'notEquals' | 'greaterThan' | 'greaterThanOrEqual' | 'lessThan' | 'lessThanOrEqual' | 'between'
export type DateOperator = 'before' | 'after' | 'between' | 'olderThan' | 'newerThan' | 'null' | 'notNull'
export type BooleanOperator = 'equals' | 'notEquals'
export type ArrayOperator = 'contains' | 'notContains' | 'containsAny' | 'containsAll' | 'isEmpty' | 'isNotEmpty'

export type ComparisonOperator = StringOperator | NumberOperator | DateOperator | BooleanOperator | ArrayOperator

// Field metadata for UI generation and validation
export interface FieldDefinition {
  key: string
  label: string
  description?: string
  type: FieldType
  dataSource: DataSource
  mediaTypes: MediaType[] // MOVIE, TV_SERIES, EPISODE
  allowedOperators: ComparisonOperator[]
  enumValues?: Array<{ value: string; label: string }> // For enum types
  unit?: 'bytes' | 'seconds' | 'minutes' | 'hours' | 'days' | 'kbps' // For display/conversion
  category: 'metadata' | 'playback' | 'file' | 'quality' | 'external' // For UI grouping
}

// Comprehensive field registry
export const FIELD_DEFINITIONS: FieldDefinition[] = [
  // === METADATA CATEGORY ===
  // Source: Tautulli get_library_media_info endpoint
  // These fields come from Plex metadata accessed via Tautulli

  // Source API: Tautulli get_library_media_info → item.title
  // Field mapping: Direct string from Plex metadata
  {
    key: 'title',
    label: 'Title',
    type: 'string',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals', 'notEquals', 'contains', 'notContains', 'startsWith', 'regex'],
    category: 'metadata',
  },
  // Source API: Tautulli get_library_media_info → item.year
  // Field mapping: Release year from Plex metadata
  {
    key: 'year',
    label: 'Year',
    type: 'number',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals', 'notEquals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'between'],
    category: 'metadata',
  },

  // Source API: Tautulli get_library_media_info → item.rating
  // Field mapping: User-set rating in Plex (0-10 scale), may be null
  {
    key: 'rating',
    label: 'Rating (User)',
    description: 'Plex user rating (0-10)',
    type: 'number',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'between', 'null', 'notNull'],
    category: 'metadata',
  },

  // Source API: Tautulli get_library_media_info → item.audience_rating
  // Field mapping: TMDB/IMDB public rating, may be null
  {
    key: 'audienceRating',
    label: 'Audience Rating',
    description: 'TMDB/IMDB audience rating',
    type: 'number',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'between', 'null', 'notNull'],
    category: 'metadata',
  },

  // Source API: Tautulli get_library_media_info → item.content_rating
  // Field mapping: Age rating string (e.g., "PG", "PG-13", "R", "TV-MA")
  {
    key: 'contentRating',
    label: 'Content Rating',
    description: 'Age rating (PG, PG-13, R, etc.)',
    type: 'string',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals', 'notEquals', 'in', 'notIn'],
    category: 'metadata',
  },

  // Source API: Tautulli get_library_media_info → item.genres
  // Field mapping: Array of genre strings from Plex metadata
  {
    key: 'genres',
    label: 'Genres',
    type: 'array',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['contains', 'notContains', 'containsAny', 'containsAll', 'isEmpty'],
    category: 'metadata',
  },

  // Source API: Tautulli get_library_media_info → item.labels
  // Field mapping: Array of user-applied labels/tags from Plex
  {
    key: 'labels',
    label: 'Labels/Tags',
    type: 'array',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['contains', 'notContains', 'containsAny', 'containsAll', 'isEmpty'],
    category: 'metadata',
  },

  // Source API: Tautulli get_library_media_info → item.section_id
  // Field mapping: Plex library section ID (string)
  {
    key: 'libraryId',
    label: 'Library',
    type: 'string',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals', 'notEquals', 'in', 'notIn'],
    category: 'metadata',
  },

  // === PLAYBACK CATEGORY ===
  // Source: Tautulli get_library_media_info endpoint
  // These fields track viewing history and activity

  // Source API: Tautulli get_library_media_info → item.play_count
  // Field mapping: Number of times media has been fully watched
  {
    key: 'playCount',
    label: 'Play Count',
    type: 'number',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'between'],
    category: 'playback',
  },

  // Source API: Computed from Tautulli data
  // Field mapping: Derived field (true if play_count === 0 or null)
  {
    key: 'neverWatched',
    label: 'Never Watched',
    description: 'Media that has never been played',
    type: 'boolean',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals'],
    category: 'playback',
  },

  // Source API: Tautulli get_library_media_info → item.last_played
  // Field mapping: Unix timestamp of most recent playback, may be null
  // Data refresh: Updated when media is watched
  {
    key: 'lastWatchedAt',
    label: 'Last Watched Date',
    type: 'date',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['before', 'after', 'between', 'olderThan', 'newerThan', 'null', 'notNull'],
    unit: 'days',
    category: 'playback',
  },

  // Source API: Tautulli get_library_media_info → item.added_at
  // Field mapping: Unix timestamp when media was added to library
  // Data refresh: Set once when media added, rarely changes
  {
    key: 'addedAt',
    label: 'Date Added',
    type: 'date',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['before', 'after', 'between', 'olderThan', 'newerThan'],
    unit: 'days',
    category: 'playback',
  },

  // === FILE CATEGORY ===
  // Source: Tautulli get_library_media_info endpoint
  // These fields describe the physical media file properties

  // Source API: Tautulli get_library_media_info → item.file_size
  // Field mapping: File size in bytes (for movies) or total series size (for TV)
  {
    key: 'fileSize',
    label: 'File Size',
    type: 'number',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'between'],
    unit: 'bytes',
    category: 'file',
  },

  // Source API: Tautulli get_library_media_info → item.file
  // Field mapping: Full filesystem path to media file
  {
    key: 'filePath',
    label: 'File Path',
    type: 'string',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['contains', 'notContains', 'startsWith', 'regex'],
    category: 'file',
  },

  // Source API: Tautulli get_library_media_info → item.duration
  // Field mapping: Runtime in milliseconds, converted to minutes for display
  {
    key: 'duration',
    label: 'Duration',
    type: 'number',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'between'],
    unit: 'minutes',
    category: 'file',
  },

  // === QUALITY CATEGORY ===
  // Source: Tautulli get_library_media_info endpoint
  // These fields describe video/audio quality and encoding

  // Source API: Tautulli get_library_media_info → item.video_resolution
  // Field mapping: Normalized resolution value (e.g., "1080", "720", "4k", "sd")
  {
    key: 'resolution',
    label: 'Resolution',
    type: 'enum',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals', 'notEquals', 'in', 'notIn'],
    enumValues: [
      { value: '4k', label: '4K' },
      { value: '1080', label: '1080p' },
      { value: '720', label: '720p' },
      { value: 'sd', label: 'SD' },
    ],
    category: 'quality',
  },

  // Source API: Tautulli get_library_media_info → item.video_codec
  // Field mapping: Video codec identifier (e.g., "h264", "hevc", "av1")
  {
    key: 'videoCodec',
    label: 'Video Codec',
    type: 'enum',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals', 'notEquals', 'in', 'notIn'],
    enumValues: [
      { value: 'h264', label: 'H.264' },
      { value: 'hevc', label: 'HEVC/H.265' },
      { value: 'av1', label: 'AV1' },
      { value: 'mpeg4', label: 'MPEG-4' },
      { value: 'mpeg2video', label: 'MPEG-2' },
    ],
    category: 'quality',
  },

  // Source API: Tautulli get_library_media_info → item.audio_codec
  // Field mapping: Audio codec identifier (e.g., "aac", "ac3", "dts")
  {
    key: 'audioCodec',
    label: 'Audio Codec',
    type: 'enum',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals', 'notEquals', 'in', 'notIn'],
    enumValues: [
      { value: 'aac', label: 'AAC' },
      { value: 'ac3', label: 'AC3' },
      { value: 'eac3', label: 'E-AC3' },
      { value: 'dts', label: 'DTS' },
      { value: 'truehd', label: 'TrueHD' },
      { value: 'flac', label: 'FLAC' },
      { value: 'mp3', label: 'MP3' },
    ],
    category: 'quality',
  },

  // Source API: Tautulli get_library_media_info → item.container
  // Field mapping: Container format (e.g., "mkv", "mp4", "avi")
  {
    key: 'container',
    label: 'Container Format',
    type: 'enum',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['equals', 'notEquals', 'in', 'notIn'],
    enumValues: [
      { value: 'mkv', label: 'MKV' },
      { value: 'mp4', label: 'MP4' },
      { value: 'avi', label: 'AVI' },
      { value: 'mov', label: 'MOV' },
      { value: 'wmv', label: 'WMV' },
    ],
    category: 'quality',
  },

  // Source API: Tautulli get_library_media_info → item.bitrate
  // Field mapping: Overall bitrate in kbps
  {
    key: 'bitrate',
    label: 'Bitrate',
    type: 'number',
    dataSource: 'tautulli',
    mediaTypes: ['MOVIE', 'TV_SERIES'],
    allowedOperators: ['greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual', 'between'],
    unit: 'kbps',
    category: 'quality',
  },

  // === RADARR FIELDS (Movies only) ===
  // Source: Radarr /api/v3/movie endpoint
  // Requires: Radarr integration must be configured
  // Data refresh: Fetched on-demand during maintenance scans
  // Note: Returns null if Radarr integration not configured or movie not found

  // Source API: Radarr /api/v3/movie → movie.hasFile
  // Field mapping: Boolean indicating if movie file exists in Radarr
  // Requirements: Radarr integration configured, movie matched by TMDB ID
  {
    key: 'radarr.hasFile',
    label: 'Has File (Radarr)',
    type: 'boolean',
    dataSource: 'radarr',
    mediaTypes: ['MOVIE'],
    allowedOperators: ['equals'],
    category: 'external',
  },

  // Source API: Radarr /api/v3/movie → movie.monitored
  // Field mapping: Boolean indicating if movie is monitored for new releases
  // Requirements: Radarr integration configured, movie matched by TMDB ID
  {
    key: 'radarr.monitored',
    label: 'Monitored (Radarr)',
    type: 'boolean',
    dataSource: 'radarr',
    mediaTypes: ['MOVIE'],
    allowedOperators: ['equals'],
    category: 'external',
  },

  // Source API: Radarr /api/v3/movie → movie.qualityProfileId
  // Field mapping: Integer ID of quality profile (match with /api/v3/qualityprofile)
  // Requirements: Radarr integration configured, movie matched by TMDB ID
  {
    key: 'radarr.qualityProfileId',
    label: 'Quality Profile (Radarr)',
    type: 'number',
    dataSource: 'radarr',
    mediaTypes: ['MOVIE'],
    allowedOperators: ['equals', 'notEquals', 'in', 'notIn'],
    category: 'external',
  },

  // Source API: Radarr /api/v3/movie → movie.minimumAvailability
  // Field mapping: Enum value for minimum availability setting
  // Requirements: Radarr integration configured, movie matched by TMDB ID
  {
    key: 'radarr.minimumAvailability',
    label: 'Minimum Availability (Radarr)',
    type: 'enum',
    dataSource: 'radarr',
    mediaTypes: ['MOVIE'],
    allowedOperators: ['equals', 'notEquals', 'in', 'notIn'],
    enumValues: [
      { value: 'announced', label: 'Announced' },
      { value: 'inCinemas', label: 'In Cinemas' },
      { value: 'released', label: 'Released' },
      { value: 'preDB', label: 'PreDB' },
    ],
    category: 'external',
  },

  // === SONARR FIELDS (TV only) ===
  // Source: Sonarr /api/v3/series endpoint
  // Requires: Sonarr integration must be configured
  // Data refresh: Fetched on-demand during maintenance scans
  // Note: Returns null if Sonarr integration not configured or series not found

  // Source API: Sonarr /api/v3/series → series.monitored
  // Field mapping: Boolean indicating if series is monitored for new episodes
  // Requirements: Sonarr integration configured, series matched by TVDB ID
  {
    key: 'sonarr.monitored',
    label: 'Monitored (Sonarr)',
    type: 'boolean',
    dataSource: 'sonarr',
    mediaTypes: ['TV_SERIES'],
    allowedOperators: ['equals'],
    category: 'external',
  },

  // Source API: Sonarr /api/v3/series → series.status
  // Field mapping: Enum value for series status ("continuing" or "ended")
  // Requirements: Sonarr integration configured, series matched by TVDB ID
  {
    key: 'sonarr.status',
    label: 'Series Status (Sonarr)',
    type: 'enum',
    dataSource: 'sonarr',
    mediaTypes: ['TV_SERIES'],
    allowedOperators: ['equals', 'notEquals', 'in', 'notIn'],
    enumValues: [
      { value: 'continuing', label: 'Continuing' },
      { value: 'ended', label: 'Ended' },
    ],
    category: 'external',
  },

  // Source API: Sonarr /api/v3/series → series.episodeFileCount
  // Field mapping: Number of episode files downloaded/available
  // Requirements: Sonarr integration configured, series matched by TVDB ID
  {
    key: 'sonarr.episodeFileCount',
    label: 'Episode File Count (Sonarr)',
    description: 'Number of episode files available',
    type: 'number',
    dataSource: 'sonarr',
    mediaTypes: ['TV_SERIES'],
    allowedOperators: ['equals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual'],
    category: 'external',
  },

  // Source API: Sonarr /api/v3/series → series.percentOfEpisodes
  // Field mapping: Calculated percentage (episodeFileCount / episodeCount * 100)
  // Requirements: Sonarr integration configured, series matched by TVDB ID
  {
    key: 'sonarr.percentOfEpisodes',
    label: 'Percent Complete (Sonarr)',
    description: 'Percentage of episodes available',
    type: 'number',
    dataSource: 'sonarr',
    mediaTypes: ['TV_SERIES'],
    allowedOperators: ['equals', 'greaterThan', 'greaterThanOrEqual', 'lessThan', 'lessThanOrEqual'],
    category: 'external',
  },
]

/**
 * Get fields filtered by media type
 */
export function getFieldsForMediaType(mediaType: MediaType): FieldDefinition[] {
  return FIELD_DEFINITIONS.filter(f => f.mediaTypes.includes(mediaType))
}

/**
 * Get fields grouped by category
 */
export function getFieldsByCategory(mediaType: MediaType): Record<string, FieldDefinition[]> {
  const fields = getFieldsForMediaType(mediaType)
  const grouped: Record<string, FieldDefinition[]> = {
    metadata: [],
    playback: [],
    file: [],
    quality: [],
    external: [],
  }

  fields.forEach(field => {
    grouped[field.category].push(field)
  })

  return grouped
}

/**
 * Get fields grouped by data source (recommended for UI organization)
 */
export function getFieldsByDataSource(mediaType: MediaType): Record<string, FieldDefinition[]> {
  const fields = getFieldsForMediaType(mediaType)
  const grouped: Record<string, FieldDefinition[]> = {
    plex: [],
    tautulli: [],
    radarr: [],
    sonarr: [],
  }

  fields.forEach(field => {
    grouped[field.dataSource].push(field)
  })

  return grouped
}

/**
 * Get field definition by key
 */
export function getFieldDefinition(key: string): FieldDefinition | undefined {
  return FIELD_DEFINITIONS.find(f => f.key === key)
}

/**
 * Format operator label for UI display
 */
export function formatOperatorLabel(operator: ComparisonOperator): string {
  const labels: Record<string, string> = {
    equals: 'equals',
    notEquals: 'not equals',
    contains: 'contains',
    notContains: 'does not contain',
    startsWith: 'starts with',
    endsWith: 'ends with',
    regex: 'matches regex',
    in: 'is one of',
    notIn: 'is not one of',
    greaterThan: 'greater than',
    greaterThanOrEqual: 'greater than or equal to',
    lessThan: 'less than',
    lessThanOrEqual: 'less than or equal to',
    between: 'between',
    before: 'before',
    after: 'after',
    olderThan: 'older than',
    newerThan: 'newer than',
    null: 'is empty',
    notNull: 'is not empty',
    containsAny: 'contains any of',
    containsAll: 'contains all of',
    isEmpty: 'is empty',
    isNotEmpty: 'is not empty',
  }

  return labels[operator] || operator
}

/**
 * Generate unique ID for condition/group
 */
export function generateId(): string {
  return Math.random().toString(36).substring(2, 11)
}
