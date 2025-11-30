/**
 * Refresh intervals for observability dashboard real-time panels
 * All values in milliseconds
 */
export const REFRESH_INTERVALS = {
  /** Active Plex sessions - needs fast updates for real-time viewing */
  ACTIVE_SESSIONS: 10_000, // 10 seconds

  /** Download queues from Sonarr/Radarr - moderate refresh rate */
  DOWNLOAD_QUEUES: 15_000, // 15 seconds

  /** Storage and library info - changes slowly */
  STORAGE: 60_000, // 1 minute

  /** Media requests from Overseerr - changes slowly */
  REQUESTS: 60_000, // 1 minute
} as const

export type RefreshIntervalKey = keyof typeof REFRESH_INTERVALS
