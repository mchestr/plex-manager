/**
 * Statistics functions for Wrapped
 *
 * This is a barrel file that re-exports all statistics-related functions
 * from their provider-specific modules.
 */

// Types
export type {
  TautulliConfig,
  PlexConfig,
  OverseerrConfig,
  TautulliStatisticsData,
  ServerStatisticsData,
  OverseerrStatisticsData,
  TopMedia,
  TopShow,
  MonthlyWatchTime,
  LibrarySize,
  LeaderboardEntry,
  WatchTimeLeaderboardEntry,
  ContentLeaderboard,
  ShowContentLeaderboard,
} from "./statistics-types"

// Tautulli statistics
export {
  fetchTautulliStatistics,
  fetchItemLeaderboard,
  fetchWatchTimeLeaderboard,
  fetchTopContentLeaderboards,
  fetchTautulliLibraryCounts,
} from "./tautulli-statistics"

// Overseerr statistics
export { fetchOverseerrStatistics } from "./overseerr-statistics"

// Server statistics (Plex + Tautulli combined)
export { fetchPlexServerStatistics } from "./server-statistics"

// Re-export formatBytes for backward compatibility with existing imports
export { formatBytes } from "@/lib/utils/time-formatting"
