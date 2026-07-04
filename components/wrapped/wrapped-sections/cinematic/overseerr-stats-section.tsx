"use client"

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

  return (
    <SlideFrame eyebrow="The Commissions" title={section.title} narrative={section.content}>
      {stats && (
        <div className="space-y-6 pt-2">
          <div className="flex flex-wrap items-baseline justify-center gap-x-12 gap-y-6">
            <GoldCountUp value={stats.totalRequests} className="text-5xl sm:text-7xl" suffix="requests" />
            <GoldCountUp value={stats.approvedRequests} className="text-5xl sm:text-7xl" suffix="approved" />
          </div>
          {stats.topRequestedGenres.length > 0 && (
            <p className="text-xs sm:text-sm text-taupe uppercase tracking-[0.25em]">
              Favored genres · {stats.topRequestedGenres.slice(0, 3).map((g) => g.genre).join(" · ")}
            </p>
          )}
        </div>
      )}
    </SlideFrame>
  )
}
