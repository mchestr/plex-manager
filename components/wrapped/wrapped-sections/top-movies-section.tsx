"use client"

import { FormattedText } from "@/components/shared/formatted-text"
import { formatDuration } from "@/lib/utils/format"
import { WrappedSection } from "@/types/wrapped"

interface TopMoviesSectionProps {
  section: WrappedSection
}

export function TopMoviesSection({ section }: TopMoviesSectionProps) {
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
        {section.data && "movies" in section.data && Array.isArray(section.data.movies) && (section.data.movies as Array<{ title: string; watchTime: number; playCount: number; year?: number }>).map((movie, idx: number) => (
          <div
            key={idx}
            className="bg-slate-800/50 backdrop-blur-sm border border-cyan-500/30 rounded-lg p-4 relative overflow-hidden"
          >
            <div className="absolute top-0 left-0 w-1 h-full bg-gradient-to-b from-cyan-400 via-purple-400 to-pink-400" />
            <div className="flex items-center gap-4 relative pl-2">
              <span className="text-xl sm:text-2xl font-bold text-cyan-400 w-8 sm:w-10 flex-shrink-0">
                #{idx + 1}
              </span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 flex-wrap">
                  <p className="text-white font-semibold text-base sm:text-lg">
                    {movie.title}
                  </p>
                  {movie.year && (
                    <span className="text-slate-400 text-xs sm:text-sm">
                      ({movie.year})
                    </span>
                  )}
                </div>
                <p className="text-slate-300 text-xs sm:text-sm mt-1">
                  {formatDuration(movie.watchTime, "long", { largestUnit: "day" })} watched
                </p>
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

