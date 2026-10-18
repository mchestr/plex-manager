"use client"

import type { ShareSafeRewindV2 } from "@/lib/wrapped/data/share-safe-v2"
import { motion } from "framer-motion"
import { FormattedText } from "@/components/shared/formatted-text"
import { SpaceBackground } from "@/components/setup/setup-wizard/space-background"
import { formatWatchTime, formatWatchTimeHours } from "@/lib/utils/time-formatting"
import { PosterImage } from "@/components/wrapped/cinematic/poster-image"
import Link from "next/link"

interface WrappedShareSummaryProps {
  /** The share-safe projection; nothing else of the stored Rewind reaches the client */
  rewind: ShareSafeRewindV2
  /** Share token for poster access (viewers of shared wraps are logged out) */
  shareToken?: string
}

function monthName(month: number): string {
  return new Date(Date.UTC(2000, month - 1, 1)).toLocaleString("en-US", { month: "long", timeZone: "UTC" })
}

export function WrappedShareSummary({ rewind, shareToken }: WrappedShareSummaryProps) {
  const { ownerName, year, summary, totals, months, topMovies, topShows } = rewind
  const busiestMonth = months.reduce<(typeof months)[number] | null>(
    (max, month) => (!max || month.minutes > max.minutes ? month : max),
    null
  )

  return (
    <div data-testid="wrapped-share-summary" className="relative min-h-screen overflow-hidden">
      <SpaceBackground />

      <div className="relative z-10 container mx-auto px-4 py-12 max-w-4xl">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="text-center mb-12"
        >
          <h1 data-testid="wrapped-share-heading" className="text-5xl md:text-6xl font-bold mb-4 bg-gradient-to-r from-cyan-400 via-purple-400 to-pink-400 bg-clip-text text-transparent">
            {ownerName}'s {year} Plex Wrapped
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
          <div data-testid="wrapped-total-watch-time" className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6 text-center">
            <div className="text-3xl font-bold text-cyan-400 mb-2">
              {formatWatchTimeHours(totals.minutes)}
            </div>
            <div data-testid="wrapped-total-watch-time-label" className="text-slate-400 text-sm">Total Watch Time</div>
          </div>

          <div data-testid="wrapped-movies-watched" className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6 text-center">
            <div className="text-3xl font-bold text-purple-400 mb-2">
              {totals.movies.toLocaleString()}
            </div>
            <div data-testid="wrapped-movies-watched-label" className="text-slate-400 text-sm">Movies Watched</div>
          </div>

          <div data-testid="wrapped-shows-watched" className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6 text-center">
            <div className="text-3xl font-bold text-pink-400 mb-2">
              {totals.shows.toLocaleString()}
            </div>
            <div data-testid="wrapped-shows-watched-label" className="text-slate-400 text-sm">Shows Watched</div>
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
                    {movie.ratingKey && (
                      <PosterImage
                        ratingKey={movie.ratingKey}
                        alt={`${movie.title} poster`}
                        shareToken={shareToken}
                        className="w-10 flex-shrink-0"
                        sizes="40px"
                      />
                    )}
                    <div>
                      <div className="text-xl font-semibold text-white">
                        {movie.title}
                        {movie.year && (
                          <span className="text-slate-400 ml-2">({movie.year})</span>
                        )}
                      </div>
                      <div className="text-sm text-slate-400">
                        {formatWatchTime(movie.minutes)} • {movie.plays} play{movie.plays !== 1 ? "s" : ""}
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
                    {show.ratingKey && (
                      <PosterImage
                        ratingKey={show.ratingKey}
                        alt={`${show.title} poster`}
                        shareToken={shareToken}
                        className="w-10 flex-shrink-0"
                        sizes="40px"
                      />
                    )}
                    <div>
                      <div className="text-xl font-semibold text-white">
                        {show.title}
                        {show.year && (
                          <span className="text-slate-400 ml-2">({show.year})</span>
                        )}
                      </div>
                      <div className="text-sm text-slate-400">
                        {formatWatchTime(show.minutes)} • {show.episodes} episode{show.episodes !== 1 ? "s" : ""}
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
          {totals.episodes > 0 && (
            <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
              <div className="text-2xl font-bold text-pink-400 mb-2">
                {totals.episodes.toLocaleString()}
              </div>
              <div className="text-slate-400 text-sm">Episodes Watched</div>
            </div>
          )}

          {busiestMonth && (
            <div className="bg-slate-800/60 backdrop-blur-sm border border-slate-700 rounded-lg p-6">
              <div className="text-2xl font-bold text-cyan-400 mb-2">
                {monthName(busiestMonth.month)}
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

