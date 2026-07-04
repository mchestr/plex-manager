"use client"

import { FormattedText } from "@/components/shared/formatted-text"
import { GOLD_HIGHLIGHT_CLASS } from "@/components/wrapped/cinematic/theme"
import { WrappedData, WrappedSection } from "@/types/wrapped"

import { CinematicArchetypeRevealSection } from "./archetype-reveal-section"
import { CinematicFinaleSection } from "./finale-section"
import { CinematicFunFactsSection } from "./fun-facts-section"
import { CinematicHeroSection } from "./hero-section"
import { CinematicMonthlyJourneySection } from "./monthly-journey-section"
import { CinematicMoviesBreakdownSection } from "./movies-breakdown-section"
import { CinematicOverseerrStatsSection } from "./overseerr-stats-section"
import { CinematicPercentileSection } from "./percentile-section"
import { CinematicServerStatsSection } from "./server-stats-section"
import { CinematicShowsBreakdownSection } from "./shows-breakdown-section"
import { CinematicStreaksPatternsSection } from "./streaks-patterns-section"
import { CinematicTopMoviesSection } from "./top-movies-section"
import { CinematicTopShowsSection } from "./top-shows-section"
import { CinematicTotalWatchTimeSection } from "./total-watch-time-section"

interface CinematicSectionRendererProps {
  section: WrappedSection
  wrappedData: WrappedData
}

export function CinematicSectionRenderer({ section, wrappedData }: CinematicSectionRendererProps) {
  switch (section.type) {
    case "hero":
      return <CinematicHeroSection section={section} />
    case "total-watch-time":
      return <CinematicTotalWatchTimeSection section={section} />
    case "movies-breakdown":
      return <CinematicMoviesBreakdownSection section={section} />
    case "shows-breakdown":
      return <CinematicShowsBreakdownSection section={section} />
    case "top-movies":
      return <CinematicTopMoviesSection section={section} />
    case "top-shows":
      return <CinematicTopShowsSection section={section} />
    case "streaks-patterns":
      return <CinematicStreaksPatternsSection section={section} />
    case "monthly-journey":
      return <CinematicMonthlyJourneySection section={section} />
    case "percentile":
      return <CinematicPercentileSection section={section} />
    case "archetype-reveal":
      return <CinematicArchetypeRevealSection section={section} />
    case "server-stats":
      return <CinematicServerStatsSection section={section} />
    case "overseerr-stats":
      return <CinematicOverseerrStatsSection section={section} />
    case "fun-facts":
      return <CinematicFunFactsSection section={section} />
    case "finale":
      return <CinematicFinaleSection section={section} userName={wrappedData.userName} />
    default:
      return (
        <div className="text-center space-y-4">
          <h2 className="font-serif uppercase tracking-[0.12em] text-2xl text-ivory">{section.title}</h2>
          {section.content && (
            <p className="text-lg text-ivory/80">
              <FormattedText text={section.content} highlightClassName={GOLD_HIGHLIGHT_CLASS} />
            </p>
          )}
        </div>
      )
  }
}
