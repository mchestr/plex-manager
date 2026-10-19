"use client"

import { FormattedText } from "@/components/shared/formatted-text"
import { formatDuration } from "@/lib/utils/format"
import { WrappedSection } from "@/types/wrapped"

interface TopShowsSectionProps {
  section: WrappedSection
}

export function TopShowsSection({ section }: TopShowsSectionProps) {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h2 className="text-3xl sm:text-4xl font-bold text-white mb-2">{section.title}</h2>
        {section.subtitle && (
          <p className="text-base sm:text-lg text-purple-200">
            {section.subtitle}
          </p>
        )}
      </div>
      <div className="space-y-3 max-w-3xl mx-auto">
        {section.data && "shows" in section.data && Array.isArray(section.data.shows) && (section.data.shows as Array<{ title: string; watchTime: number; episodesWatched: number; year?: number }>).map((show, idx: number) => (
          <div
            key={idx}
            className="bg-slate-800/50 backdrop-blur-sm border border-purple-500/30 rounded-lg p-4 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-purple-400 via-pink-400 to-cyan-400" />
            <div className="flex items-center gap-4 relative pl-2">
              <span className="text-xl sm:text-2xl font-bold text-purple-400 w-8 sm:w-10 flex-shrink-0">
                #{idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-white font-semibold text-base sm:text-lg">
                    {show.title}
                  </p>
                  {show.year && (
                    <span className="text-slate-400 text-xs sm:text-sm">
                      ({show.year})
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-3 text-slate-300 text-xs sm:text-sm mt-1 flex-wrap">
                  <span>{formatDuration(show.watchTime, "long", { largestUnit: "day" })} watched</span>
                  <span className="text-slate-400">•</span>
                  <span>{show.episodesWatched} episode{show.episodesWatched !== 1 ? "s" : ""}</span>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>
      {section.content && (
        <p className="text-base sm:text-lg text-slate-300 text-center max-w-2xl mx-auto">
          <FormattedText text={section.content} />
        </p>
      )}
    </div>
  )
}

