/**
 * Type definitions for statistics functions
 */

export interface TautulliConfig {
  url: string
  apiKey: string
}

export interface PlexConfig {
  url: string
  token: string
}

export interface OverseerrConfig {
  url: string
  apiKey: string
}

export interface TopMedia {
  title: string
  watchTime: number
  playCount: number
  year?: number
  rating?: number
  ratingKey?: string
}

export interface TopShow extends TopMedia {
  episodesWatched: number
}

export interface MonthlyWatchTime {
  month: number
  monthName: string
  watchTime: number
  topMovie?: {
    title: string
    watchTime: number
    playCount: number
    year?: number
    rating?: number
  }
  topShow?: {
    title: string
    watchTime: number
    playCount: number
    episodesWatched: number
    year?: number
    rating?: number
  }
}

export interface TautulliStatisticsData {
  tautulliUserId: string
  totalWatchTime: number
  moviesWatchTime: number
  showsWatchTime: number
  moviesWatched: number
  showsWatched: number
  episodesWatched: number
  topMovies: TopMedia[]
  topShows: TopShow[]
  watchTimeByMonth: MonthlyWatchTime[]
}

export interface LibrarySize {
  movies: number
  shows: number
  episodes: number
}

export interface ServerStatisticsData {
  totalStorage: number
  totalStorageFormatted: string
  librarySize: LibrarySize
}

export interface OverseerrStatisticsData {
  totalRequests: number
  totalServerRequests: number
  approvedRequests: number
  pendingRequests: number
  topRequestedGenres: Array<{
    genre: string
    count: number
  }>
}

export interface LeaderboardEntry {
  userId: string
  username: string
  friendlyName: string
  watchTime: number
  playCount: number
  episodesWatched?: number
}

export interface WatchTimeLeaderboardEntry {
  userId: string
  username: string
  friendlyName: string
  totalWatchTime: number
  moviesWatchTime: number
  showsWatchTime: number
}

export interface ContentLeaderboard {
  title: string
  ratingKey?: string
  leaderboard: LeaderboardEntry[]
  userPosition?: number
  totalWatchers: number
}

export interface ShowContentLeaderboard extends ContentLeaderboard {
  leaderboard: Array<LeaderboardEntry & { episodesWatched: number }>
}
