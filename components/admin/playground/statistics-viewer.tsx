"use client"

import { Button } from "@/components/ui/button"
import { WrappedStatistics } from "@/types/wrapped"

interface StatisticsViewerProps {
  statistics: WrappedStatistics
  viewMode: "formatted" | "json"
  onViewModeChange: (mode: "formatted" | "json") => void
}

export function StatisticsViewer({
  statistics,
  viewMode,
  onViewModeChange,
}: StatisticsViewerProps) {
  return (
    <div className="bg-slate-900/50 border border-slate-700/50 rounded-lg p-3 mt-2">
      {/* View Mode Toggle */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-white">Statistics Data</h4>
        <div className="flex items-center gap-2">
          <Button
            type="button"
            onClick={() => onViewModeChange("formatted")}
            variant={viewMode === "formatted" ? "primary" : "secondary"}
            size="sm"
            className="px-2 py-1 text-xs h-auto"
          >
            Formatted
          </Button>
          <Button
            type="button"
            onClick={() => onViewModeChange("json")}
            variant={viewMode === "json" ? "primary" : "secondary"}
            size="sm"
            className="px-2 py-1 text-xs h-auto"
          >
            JSON
          </Button>
        </div>
      </div>

      {/* Formatted View */}
      {viewMode === "formatted" && (
        <div className="space-y-3 max-h-96 overflow-y-auto">
          {/* Summary Stats */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
            <div className="bg-slate-800/50 rounded p-2 border border-slate-700">
              <div className="text-xs text-slate-400 mb-0.5">Total Watch Time</div>
              <div className="text-sm font-semibold text-cyan-400">
                {Math.round(statistics.totalWatchTime.total / 60)}h
              </div>
            </div>
            <div className="bg-slate-800/50 rounded p-2 border border-slate-700">
              <div className="text-xs text-slate-400 mb-0.5">Movies Watched</div>
              <div className="text-sm font-semibold text-purple-400">
                {statistics.moviesWatched}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded p-2 border border-slate-700">
              <div className="text-xs text-slate-400 mb-0.5">Shows Watched</div>
              <div className="text-sm font-semibold text-green-400">
                {statistics.showsWatched}
              </div>
            </div>
            <div className="bg-slate-800/50 rounded p-2 border border-slate-700">
              <div className="text-xs text-slate-400 mb-0.5">Episodes Watched</div>
              <div className="text-sm font-semibold text-yellow-400">
                {statistics.episodesWatched.toLocaleString()}
              </div>
            </div>
          </div>

          {/* Top Movies */}
          {statistics.topMovies.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-slate-300 mb-1.5">Top Movies</h5>
              <div className="space-y-1">
                {statistics.topMovies.slice(0, 5).map((movie, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-800/30 rounded p-2 border border-slate-700/50 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200 font-medium">{movie.title}</span>
                      <span className="text-slate-400">
                        {Math.round(movie.watchTime / 60)}h • {movie.playCount}x
                      </span>
                    </div>
                    {movie.year && (
                      <div className="text-slate-500 mt-0.5">{movie.year}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Top Shows */}
          {statistics.topShows.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-slate-300 mb-1.5">Top Shows</h5>
              <div className="space-y-1">
                {statistics.topShows.slice(0, 5).map((show, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-800/30 rounded p-2 border border-slate-700/50 text-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span className="text-slate-200 font-medium">{show.title}</span>
                      <span className="text-slate-400">
                        {Math.round(show.watchTime / 60)}h • {show.episodesWatched} eps
                      </span>
                    </div>
                    {show.year && (
                      <div className="text-slate-500 mt-0.5">{show.year}</div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Watch Time by Month */}
          {statistics.watchTimeByMonth && statistics.watchTimeByMonth.length > 0 && (
            <div>
              <h5 className="text-xs font-semibold text-slate-300 mb-1.5">Watch Time by Month</h5>
              <div className="grid grid-cols-2 gap-1.5">
                {statistics.watchTimeByMonth.map((month, idx) => (
                  <div
                    key={idx}
                    className="bg-slate-800/30 rounded p-1.5 border border-slate-700/50 text-xs"
                  >
                    <div className="text-slate-300 font-medium">{month.monthName}</div>
                    <div className="text-slate-400">{Math.round(month.watchTime / 60)}h</div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Server Stats */}
          {statistics.serverStats && (
            <div>
              <h5 className="text-xs font-semibold text-slate-300 mb-1.5">Server Statistics</h5>
              <div className="bg-slate-800/30 rounded p-2 border border-slate-700/50 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Server:</span>
                  <span className="text-slate-200">{statistics.serverStats.serverName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Storage:</span>
                  <span className="text-slate-200">{statistics.serverStats.totalStorageFormatted}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Movies:</span>
                  <span className="text-slate-200">{statistics.serverStats.librarySize.movies.toLocaleString()}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Shows:</span>
                  <span className="text-slate-200">{statistics.serverStats.librarySize.shows.toLocaleString()}</span>
                </div>
              </div>
            </div>
          )}

          {/* Overseerr Stats */}
          {statistics.overseerrStats && (
            <div>
              <h5 className="text-xs font-semibold text-slate-300 mb-1.5">Overseerr Statistics</h5>
              <div className="bg-slate-800/30 rounded p-2 border border-slate-700/50 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Total Requests:</span>
                  <span className="text-slate-200">{statistics.overseerrStats.totalRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Approved:</span>
                  <span className="text-slate-200">{statistics.overseerrStats.approvedRequests}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Pending:</span>
                  <span className="text-slate-200">{statistics.overseerrStats.pendingRequests}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* JSON View */}
      {viewMode === "json" && (
        <pre className="bg-slate-900/70 p-3 rounded-lg overflow-x-auto text-xs text-slate-300 whitespace-pre-wrap max-h-96 overflow-y-auto border border-slate-700">
          {JSON.stringify(statistics, null, 2)}
        </pre>
      )}
    </div>
  )
}

