"use client"

import { GoldCountUp } from "@/components/wrapped/cinematic/gold-count-up"
import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import { formatWatchTime } from "@/lib/utils/time-formatting"
import { WrappedSection } from "@/types/wrapped"

interface Props {
  section: WrappedSection
}

export function CinematicShowsBreakdownSection({ section }: Props) {
  const data = (section.data || {}) as {
    showsWatched?: number
    episodesWatched?: number
    watchTime?: number
  }

  return (
    <SlideFrame eyebrow="Act II — The Series" title={section.title} narrative={section.content}>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-6 sm:gap-16 pt-2">
        <GoldCountUp value={data.showsWatched ?? 0} className="text-6xl sm:text-7xl" suffix="series" />
        <GoldCountUp value={data.episodesWatched ?? 0} className="text-6xl sm:text-7xl" suffix="episodes" />
      </div>
      {typeof data.watchTime === "number" && data.watchTime > 0 && (
        <p className="text-sm sm:text-base text-taupe uppercase tracking-[0.25em] mt-4">
          {formatWatchTime(data.watchTime)} of episodic viewing
        </p>
      )}
    </SlideFrame>
  )
}
