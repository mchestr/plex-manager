"use client"

import { GoldCountUp } from "@/components/wrapped/cinematic/gold-count-up"
import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import { WrappedSection, WrappedStatistics } from "@/types/wrapped"

interface Props {
  section: WrappedSection
}

export function CinematicServerStatsSection({ section }: Props) {
  const serverStats = (
    section.data && "serverStats" in section.data ? section.data.serverStats : undefined
  ) as WrappedStatistics["serverStats"] | undefined

  return (
    <SlideFrame eyebrow="Behind the Scenes" title={section.title} narrative={section.content}>
      {serverStats && (
        <div className="space-y-6 pt-2">
          <p className="font-serif text-3xl sm:text-5xl text-gold-bright uppercase tracking-wide">
            {serverStats.serverName}
          </p>
          <div className="flex flex-wrap items-baseline justify-center gap-x-12 gap-y-6">
            <GoldCountUp value={serverStats.librarySize.movies} className="text-4xl sm:text-6xl" suffix="films" />
            <GoldCountUp value={serverStats.librarySize.shows} className="text-4xl sm:text-6xl" suffix="series" />
            <GoldCountUp value={serverStats.librarySize.episodes} className="text-4xl sm:text-6xl" suffix="episodes" />
          </div>
          <p className="text-xs sm:text-sm text-taupe uppercase tracking-[0.25em]">
            {serverStats.totalStorageFormatted} of stories in the vault
          </p>
        </div>
      )}
    </SlideFrame>
  )
}
