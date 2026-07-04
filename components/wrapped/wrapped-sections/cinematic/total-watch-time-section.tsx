"use client"

import { motion } from "framer-motion"

import { GoldCountUp } from "@/components/wrapped/cinematic/gold-count-up"
import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import { formatWatchTime } from "@/lib/utils/time-formatting"
import { WrappedSection } from "@/types/wrapped"

interface Props {
  section: WrappedSection
}

export function CinematicTotalWatchTimeSection({ section }: Props) {
  const totalWatchTime = (
    section.data && "totalWatchTime" in section.data
      ? section.data.totalWatchTime
      : undefined
  ) as { total: number; movies: number; shows: number } | undefined

  const total = totalWatchTime?.total ?? 0
  const moviesPct = total > 0 ? Math.round(((totalWatchTime?.movies ?? 0) / total) * 100) : 0

  return (
    <SlideFrame eyebrow="Act I — Running Time" title={section.title} narrative={section.content}>
      {totalWatchTime && (
        <div className="space-y-8 pt-2">
          <GoldCountUp
            value={Math.floor(total / 60)}
            suffix="hours"
            className="text-6xl sm:text-8xl"
          />
          {/* Films vs series split, projected as a single gold reel bar */}
          <div className="max-w-xl mx-auto space-y-2">
            <div className="h-2 rounded-full bg-ivory/10 overflow-hidden flex">
              <motion.div
                className="h-full bg-gradient-to-r from-gold to-gold-bright"
                initial={{ width: 0 }}
                animate={{ width: `${moviesPct}%` }}
                transition={{ duration: 1.4, delay: 1.6, ease: [0.22, 1, 0.36, 1] }}
              />
            </div>
            <div className="flex justify-between text-xs sm:text-sm uppercase tracking-[0.2em] text-taupe">
              <span>
                Films · <span className="text-gold-bright">{formatWatchTime(totalWatchTime.movies)}</span>
              </span>
              <span>
                Series · <span className="text-gold-bright">{formatWatchTime(totalWatchTime.shows)}</span>
              </span>
            </div>
          </div>
        </div>
      )}
    </SlideFrame>
  )
}
