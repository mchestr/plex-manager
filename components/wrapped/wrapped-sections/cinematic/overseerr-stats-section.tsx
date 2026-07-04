"use client"

import { motion } from "framer-motion"

import { GoldCountUp } from "@/components/wrapped/cinematic/gold-count-up"
import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import { WrappedSection, WrappedStatistics } from "@/types/wrapped"

interface Props {
  section: WrappedSection
}

export function CinematicOverseerrStatsSection({ section }: Props) {
  const stats = (
    section.data && "overseerrStats" in section.data ? section.data.overseerrStats : undefined
  ) as WrappedStatistics["overseerrStats"] | undefined

  const genres = stats?.topRequestedGenres.slice(0, 4) ?? []
  const maxGenreCount = Math.max(...genres.map((g) => g.count), 1)

  return (
    <SlideFrame eyebrow="The Commissions" title={section.title} narrative={section.content}>
      {stats && (
        <div className="space-y-8 pt-2">
          <div className="flex flex-wrap items-baseline justify-center gap-x-12 gap-y-6">
            <GoldCountUp value={stats.totalRequests} className="text-5xl sm:text-7xl" suffix="requests" />
          </div>

          {/* Favored genres: horizontal bars, request counts, top genre in gold */}
          {genres.length > 0 && (
            <div className="max-w-md mx-auto space-y-3 text-left">
              <p className="text-[10px] sm:text-xs uppercase tracking-[0.4em] text-taupe text-center">
                Favored Genres
              </p>
              {genres.map((genre, idx) => (
                <div key={genre.genre} className="flex items-center gap-3">
                  <span className="w-24 sm:w-28 flex-shrink-0 text-xs sm:text-sm text-ivory/80 uppercase tracking-[0.15em] truncate">
                    {genre.genre}
                  </span>
                  <div className="flex-1 h-2 rounded-full bg-ivory/10 overflow-hidden">
                    <motion.div
                      className={
                        idx === 0
                          ? "h-full rounded-full bg-gradient-to-r from-gold to-gold-bright"
                          : "h-full rounded-full bg-ivory/25"
                      }
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.max((genre.count / maxGenreCount) * 100, 4)}%` }}
                      transition={{ duration: 0.9, delay: 1.8 + idx * 0.15, ease: [0.22, 1, 0.36, 1] }}
                    />
                  </div>
                  <span className="w-6 flex-shrink-0 text-xs sm:text-sm text-taupe tabular-nums text-right">
                    {genre.count}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </SlideFrame>
  )
}
