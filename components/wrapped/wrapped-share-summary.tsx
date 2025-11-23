"use client"

import { WrappedData } from "@/types/wrapped"
import { motion } from "framer-motion"
import { FormattedText } from "@/components/shared/formatted-text"
import { SpaceBackground } from "@/components/setup/setup-wizard/space-background"
import Link from "next/link"

interface WrappedShareSummaryProps {
  wrappedData: WrappedData
  userName?: string
  summary?: string
  year: number
}

function formatWatchTime(minutes: number): string {
  if (minutes === 0) return "0 minutes"

  const days = Math.floor(minutes / (60 * 24))
  const hours = Math.floor((minutes % (60 * 24)) / 60)
  const mins = minutes % 60

  const parts: string[] = []
  if (days > 0) {
    parts.push(`${days} ${days === 1 ? "day" : "days"}`)
  }
  if (hours > 0) {
    parts.push(`${hours} ${hours === 1 ? "hour" : "hours"}`)
  }
  if (mins > 0 || parts.length === 0) {
    parts.push(`${mins} ${mins === 1 ? "minute" : "minutes"}`)
  }

  return parts.join(", ")
}

function formatWatchTimeHours(minutes: number): string {
  const hours = Math.floor(minutes / 60)
  const days = Math.floor(hours / 24)

  if (days > 0) {
    return `${days.toLocaleString()} day${days !== 1 ? "s" : ""}`
  }
  return `${hours.toLocaleString()} hour${hours !== 1 ? "s" : ""}`
}

export function WrappedShareSummary({
  wrappedData,
  userName,
  summary,
  year,
}: WrappedShareSummaryProps) {
  const stats = wrappedData.statistics
  const displayName = userName || wrappedData.userName || "User"

  // Get top 5 movies and shows
  const topMovies = stats.topMovies?.slice(0, 5) || []
  const topShows = stats.topShows?.slice(0, 5) || []

  return (
    <div className="relative min-h-screen overflow-hidden">
      <SpaceBackground />

      <div className="relative z-10 container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            {displayName}'s {year} Plex Wrapped
          </h1>
          {summary && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.3, duration: 0.6 }}
              className="text-xl md:text-2xl text-slate-300 mt-6 max-w-3xl mx-auto"
            >
              <FormattedText text={summary} />
            </motion.div>
          )}
        </motion.div>

        {/* Key Statistics */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4, duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12"
        >
          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6 text-center">
            <div className="text-3xl font-bold text-cyan-400 mb-2">
              {formatWatchTimeHours(stats.totalWatchTime.total)}
            </div>
            <div className="text-slate-400 text-sm">Total Watch Time</div>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6 text-center">
            <div className="text-3xl font-bold text-purple-400 mb-2">
              {stats.moviesWatched.toLocaleString()}
            </div>
            <div className="text-slate-400 text-sm">Movies Watched</div>
          </div>

          <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6 text-center">
            <div className="text-3xl font-bold text-pink-400 mb-2">
              {stats.showsWatched.toLocaleString()}
            </div>
            <div className="text-slate-400 text-sm">Shows Watched</div>
          </div>
        </motion.div>

        {/* Top Movies */}
        {topMovies.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="mb-12"
          >
            <h2 className="text-3xl font-bold mb-6 text-cyan-400">Top Movies</h2>
            <div className="space-y-4">
              {topMovies.map((movie, index) => (
                <motion.div
                  key={movie.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.6 + index * 0.1, duration: 0.5 }}
                  className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold text-slate-500 w-8">
                      #{index + 1}
                    </div>
                    <div>
                      <div className="text-xl font-semibold text-white">
                        {movie.title}
                        {movie.year && (
                          <span className="text-slate-400 ml-2">({movie.year})</span>
                        )}
                      </div>
                      <div className="text-sm text-slate-400">
                        {formatWatchTime(movie.watchTime)} • {movie.playCount} play{movie.playCount !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Top Shows */}
        {topShows.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.7, duration: 0.6 }}
            className="mb-12"
          >
            <h2 className="text-3xl font-bold mb-6 text-purple-400">Top Shows</h2>
            <div className="space-y-4">
              {topShows.map((show, index) => (
                <motion.div
                  key={show.title}
                  initial={{ opacity: 0, x: -20 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.8 + index * 0.1, duration: 0.5 }}
                  className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    <div className="text-2xl font-bold text-slate-500 w-8">
                      #{index + 1}
                    </div>
                    <div>
                      <div className="text-xl font-semibold text-white">
                        {show.title}
                        {show.year && (
                          <span className="text-slate-400 ml-2">({show.year})</span>
                        )}
                      </div>
                      <div className="text-sm text-slate-400">
                        {formatWatchTime(show.watchTime)} • {show.episodesWatched} episode{show.episodesWatched !== 1 ? "s" : ""}
                      </div>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          </motion.div>
        )}

        {/* Additional Stats */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.9, duration: 0.6 }}
          className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12"
        >
          {stats.episodesWatched > 0 && (
            <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
              <div className="text-2xl font-bold text-pink-400 mb-2">
                {stats.episodesWatched.toLocaleString()}
              </div>
              <div className="text-slate-400 text-sm">Episodes Watched</div>
            </div>
          )}

          {stats.watchTimeByMonth && stats.watchTimeByMonth.length > 0 && (
            <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
              <div className="text-2xl font-bold text-cyan-400 mb-2">
                {stats.watchTimeByMonth.reduce((max, month) =>
                  month.watchTime > max.watchTime ? month : max
                ).monthName}
              </div>
              <div className="text-slate-400 text-sm">Most Active Month</div>
            </div>
          )}
        </motion.div>

        {/* Call to Action */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 0.6 }}
          className="text-center mt-12"
        >
          <Link
            href="/"
            className="inline-block px-6 py-3 bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-700 hover:to-purple-700 text-white rounded-md font-medium transition-colors"
          >
            Create Your Own Plex Wrapped
          </Link>
        </motion.div>
      </div>
    </div>
  )
}

