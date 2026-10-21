/**
 * Type definitions for statistics functions
 */

import type { DerivedStatistics } from "./data/schema-legacy"

export interface TautulliConfig {
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

interface MonthlyWatchTime {
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
  derived: DerivedStatistics
}
