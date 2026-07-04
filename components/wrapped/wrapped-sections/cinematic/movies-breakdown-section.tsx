"use client"

import { GoldCountUp } from "@/components/wrapped/cinematic/gold-count-up"
import { SlideFrame } from "@/components/wrapped/cinematic/slide-frame"
import { formatWatchTime } from "@/lib/utils/time-formatting"
import { WrappedSection } from "@/types/wrapped"

interface Props {
  section: WrappedSection
}

export function CinematicMoviesBreakdownSection({ section }: Props) {
  const data = (section.data || {}) as { moviesWatched?: number; watchTime?: number }

  return (
    <SlideFrame eyebrow="Act II — The Features" title={section.title} narrative={section.content}>
      <div className="flex items-baseline justify-center gap-3 pt-2">
        <GoldCountUp value={data.moviesWatched ?? 0} className="text-6xl sm:text-8xl" suffix="films" />
      </div>
      {typeof data.watchTime === "number" && data.watchTime > 0 && (
        <p className="text-sm sm:text-base text-taupe uppercase tracking-[0.25em] mt-4">
          {formatWatchTime(data.watchTime)} in the screening room
        </p>
      )}
    </SlideFrame>
  )
}
