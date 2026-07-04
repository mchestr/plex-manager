import { render, screen } from "@testing-library/react"

import { SectionRenderer } from "@/components/wrapped/wrapped-sections"
import { WrappedData, WrappedSection } from "@/types/wrapped"

function buildWrappedData(overrides: Partial<WrappedData> = {}): WrappedData {
  return {
    year: 2026,
    userId: "user-1",
    userName: "Mike",
    generatedAt: new Date().toISOString(),
    statistics: {
      totalWatchTime: { total: 6000, movies: 3000, shows: 3000 },
      moviesWatched: 10,
      showsWatched: 5,
      episodesWatched: 50,
      topMovies: [],
      topShows: [],
    },
    sections: [],
    insights: {
      personality: "Cinephile",
      topGenre: "Drama",
      bingeWatcher: false,
      discoveryScore: 10,
      funFacts: [],
    },
    metadata: { totalSections: 0, generationTime: 0 },
    ...overrides,
  }
}

describe("SectionRenderer version dispatch", () => {
  it("renders the cinematic archetype reveal for v2 data", () => {
    const section: WrappedSection = {
      id: "archetype-reveal",
      type: "archetype-reveal",
      title: "And the Award Goes To…",
      subtitle: "The night belongs to you",
      content: "For 200 nights this year, the credits rolled after midnight.",
      data: {
        archetype: { id: "midnight-marathoner", name: "The Midnight Marathoner" },
      },
    }

    render(
      <SectionRenderer
        section={section}
        wrappedData={buildWrappedData({ version: 2 })}
        sectionIndex={0}
      />
    )

    expect(screen.getByTestId("wrapped-archetype-reveal")).toBeInTheDocument()
    // Name renders letter-by-letter; assert via the accessible label
    expect(screen.getByLabelText("The Midnight Marathoner")).toBeInTheDocument()
    expect(screen.getByText(/200 nights/)).toBeInTheDocument()
  })

  it("renders legacy hero for v1 data (no version field)", () => {
    const section: WrappedSection = {
      id: "hero",
      type: "hero",
      title: "Your 2025 Plex Year",
      content: "What a year it was!",
      data: {
        prominentStat: { value: 42, label: "days", description: "Total viewing time" },
      },
      animationDelay: 0,
    }

    render(
      <SectionRenderer
        section={section}
        wrappedData={buildWrappedData()}
        sectionIndex={0}
      />
    )

    // Legacy hero renders the title as a plain heading (no marquee letters)
    expect(screen.getByText("Your 2025 Plex Year")).toBeInTheDocument()
    expect(screen.getByText("What a year it was!")).toBeInTheDocument()
  })

  it("renders a fallback for unknown v2 section types", () => {
    const section = {
      id: "mystery",
      type: "mystery-type",
      title: "Mystery Section",
      content: "Unknown content",
    } as unknown as WrappedSection

    render(
      <SectionRenderer
        section={section}
        wrappedData={buildWrappedData({ version: 2 })}
        sectionIndex={0}
      />
    )

    expect(screen.getByText("Mystery Section")).toBeInTheDocument()
  })
})
