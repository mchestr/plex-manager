/**
 * The v2 statistics a Rewind is written from: the member's Tautulli history,
 * then the optional server, Overseerr and leaderboard sections. Lifted from
 * the old in-request `generatePlexWrapped` (P2.17); every call takes the run's
 * signal.
 *
 * @module
 */

import "server-only"

import { computePercentile } from "@/lib/wrapped/derived-statistics"
import { fetchOverseerrStatistics } from "@/lib/wrapped/overseerr-statistics"
import { RewindGenerationError } from "@/lib/wrapped/pipeline/generation-error"
import { fetchPlexServerStatistics } from "@/lib/wrapped/server-statistics"
import type { OverseerrConfig, PlexConfig, TautulliConfig } from "@/lib/wrapped/statistics-types"
import {
  fetchTautulliStatistics,
  fetchTopContentLeaderboards,
  fetchWatchTimeLeaderboard,
} from "@/lib/wrapped/tautulli-statistics"
import type { WrappedStatistics } from "@/types/wrapped"

interface CollectInput {
  member: { plexUserId: string; email: string | null }
  year: number
  plexServer: PlexConfig & { name: string }
  tautulli: TautulliConfig
  overseerr: OverseerrConfig | null
  signal: AbortSignal
}

/**
 * Collects the statistics for one member and year. A failed Tautulli history
 * read throws `UPSTREAM_ERROR` (retryable) and a member missing from Tautulli
 * `TAUTULLI_USER_NOT_FOUND`; the optional sections are left out on failure.
 */
export async function collectV2Statistics(input: CollectInput): Promise<WrappedStatistics> {
  const { member, year, plexServer, tautulli, overseerr, signal } = input

  const tautulliStats = await fetchTautulliStatistics(tautulli, { plexUserId: member.plexUserId }, year, null, signal)
  if (tautulliStats.code) {
    throw new RewindGenerationError(tautulliStats.code, { retryable: false })
  }
  if (!tautulliStats.success || !tautulliStats.data) {
    throw new RewindGenerationError("UPSTREAM_ERROR", { retryable: true })
  }
  const history = tautulliStats.data

  const [serverResult, overseerrResult, leaderboards] = await Promise.all([
    fetchPlexServerStatistics(plexServer, tautulli, signal),
    overseerr
      ? fetchOverseerrStatistics(overseerr, { plexUserId: member.plexUserId, email: member.email }, year, signal)
      : null,
    history.tautulliUserId ? fetchLeaderboards(tautulli, history, history.tautulliUserId, year, signal) : null,
  ])

  const serverStats =
    serverResult.success && serverResult.data
      ? {
          serverName: plexServer.name,
          totalStorage: serverResult.data.totalStorage,
          totalStorageFormatted: serverResult.data.totalStorageFormatted,
          librarySize: serverResult.data.librarySize,
        }
      : undefined
  const overseerrStats = overseerrResult?.success ? overseerrResult.data : undefined

  return {
    totalWatchTime: {
      total: history.totalWatchTime,
      movies: history.moviesWatchTime,
      shows: history.showsWatchTime,
    },
    moviesWatched: history.moviesWatched,
    showsWatched: history.showsWatched,
    episodesWatched: history.episodesWatched,
    topMovies: history.topMovies,
    topShows: history.topShows,
    watchTimeByMonth: history.watchTimeByMonth,
    derived: history.derived,
    ...(serverStats && { serverStats }),
    ...(overseerrStats && { overseerrStats }),
    ...(leaderboards && { leaderboards }),
    ...(leaderboards?.watchTime.userPosition && {
      percentile: computePercentile(leaderboards.watchTime.userPosition, leaderboards.watchTime.totalUsers),
    }),
  }
}

/** The member's places on the top-content and watch-time boards, or null when either fails. */
async function fetchLeaderboards(
  tautulli: TautulliConfig,
  history: { topMovies: WrappedStatistics["topMovies"]; topShows: WrappedStatistics["topShows"] },
  tautulliUserId: string,
  year: number,
  signal: AbortSignal
): Promise<NonNullable<WrappedStatistics["leaderboards"]> | null> {
  const [topContent, watchTime] = await Promise.all([
    fetchTopContentLeaderboards(tautulli, history.topMovies, history.topShows, tautulliUserId, year, signal),
    fetchWatchTimeLeaderboard(tautulli, year, signal),
  ])
  if (!topContent.success || !topContent.data || !watchTime.success || !watchTime.data) return null

  const userIndex = watchTime.data.findIndex((entry) => entry.userId === tautulliUserId)
  return {
    topContent: topContent.data,
    watchTime: {
      leaderboard: watchTime.data,
      userPosition: userIndex >= 0 ? userIndex + 1 : undefined,
      totalUsers: watchTime.data.length,
    },
  }
}
