import {
  assembleWrappedData,
  WRAPPED_DATA_VERSION,
} from "@/lib/wrapped/assemble-wrapped"

import { buildStatistics, buildValidOutput } from "./fixtures"

const BASE_ARGS = {
  userId: "user-1",
  userName: "Mike",
  year: 2026,
}

describe("assembleWrappedData", () => {
  it("builds v2 data with the expected section order", () => {
    const data = assembleWrappedData({
      output: buildValidOutput(),
      statistics: buildStatistics(),
      ...BASE_ARGS,
    })

    expect(data.version).toBe(WRAPPED_DATA_VERSION)
    expect(data.sections.map((s) => s.type)).toEqual([
      "hero",
      "total-watch-time",
      "movies-breakdown",
      "shows-breakdown",
      "top-movies",
      "top-shows",
      "streaks-patterns",
      "monthly-journey",
      "percentile",
      "archetype-reveal",
      "fun-facts",
      "finale",
    ])
    expect(data.metadata.totalSections).toBe(data.sections.length)
  })

  it("never sets animationDelay on any section", () => {
    const data = assembleWrappedData({
      output: buildValidOutput(),
      statistics: buildStatistics(),
      ...BASE_ARGS,
    })

    for (const section of data.sections) {
      expect(section.animationDelay).toBeUndefined()
    }
  })

  it("resolves the archetype name from the curated list", () => {
    const data = assembleWrappedData({
      output: buildValidOutput(),
      statistics: buildStatistics(),
      ...BASE_ARGS,
    })

    expect(data.archetype).toEqual({
      id: "midnight-marathoner",
      name: "The Midnight Marathoner",
      tagline: "The night belongs to you",
      dedication: expect.stringContaining("200 nights"),
    })
    const reveal = data.sections.find((s) => s.type === "archetype-reveal")
    expect(reveal?.subtitle).toBe("The night belongs to you")
    expect(reveal?.content).toContain("200 nights")
  })

  it("replaces a too-short dedication with deterministic fallback copy", () => {
    const output = buildValidOutput()
    output.archetype.dedication = "You watch a lot."

    const data = assembleWrappedData({
      output,
      statistics: buildStatistics(),
      ...BASE_ARGS,
    })

    // Fallback = motif + real numbers (1008 hours, 85 films, 412 episodes)
    expect(data.archetype.dedication).toContain("one more episode always wins")
    expect(data.archetype.dedication).toContain("<highlight>1008 hours</highlight>")
    expect(data.archetype.dedication).toContain("<highlight>85 films</highlight>")
    expect(data.archetype.dedication).toContain("<highlight>412 episodes</highlight>")

    const reveal = data.sections.find((s) => s.type === "archetype-reveal")
    expect(reveal?.content).toBe(data.archetype.dedication)
  })

  it("replaces a dedication that merely echoes the tagline", () => {
    const output = buildValidOutput()
    output.archetype.dedication = "  The night belongs to YOU. And your library missed you when you slept. "
    output.archetype.tagline = "The night belongs to YOU. And your library missed you when you slept."

    const data = assembleWrappedData({
      output,
      statistics: buildStatistics(),
      ...BASE_ARGS,
    })

    expect(data.archetype.dedication).toContain("one more episode always wins")
  })

  it("keeps a substantive dedication untouched", () => {
    const output = buildValidOutput()

    const data = assembleWrappedData({
      output,
      statistics: buildStatistics(),
      ...BASE_ARGS,
    })

    expect(data.archetype.dedication).toBe(output.archetype.dedication)
  })

  it("omits percentile section when statistics lack percentile data", () => {
    const statistics = buildStatistics({ percentile: undefined })
    const data = assembleWrappedData({
      output: buildValidOutput(),
      statistics,
      ...BASE_ARGS,
    })

    expect(data.sections.some((s) => s.type === "percentile")).toBe(false)
  })

  it("omits percentile section when the narrative is null", () => {
    const output = buildValidOutput()
    output.narratives.percentile = null
    const data = assembleWrappedData({
      output,
      statistics: buildStatistics(),
      ...BASE_ARGS,
    })

    expect(data.sections.some((s) => s.type === "percentile")).toBe(false)
  })

  it("includes server and overseerr sections when both data and narrative exist", () => {
    const output = buildValidOutput()
    output.narratives.serverStats = "The server carried quite the load."
    output.narratives.overseerr = "You asked, the server delivered."
    const statistics = buildStatistics({
      serverStats: {
        serverName: "MikeFlix",
        totalStorage: 5e12,
        totalStorageFormatted: "5 TB",
        librarySize: { movies: 1200, shows: 300, episodes: 12000 },
      },
      overseerrStats: {
        totalRequests: 40,
        totalServerRequests: 900,
        approvedRequests: 35,
        pendingRequests: 2,
        topRequestedGenres: [{ genre: "Drama", count: 12 }],
      },
    })

    const data = assembleWrappedData({ output, statistics, ...BASE_ARGS })
    const types = data.sections.map((s) => s.type)

    expect(types).toContain("server-stats")
    expect(types).toContain("overseerr-stats")
    // Conditional sections slot into the fixed order
    expect(types.indexOf("server-stats")).toBeGreaterThan(
      types.indexOf("archetype-reveal")
    )
    expect(types.indexOf("overseerr-stats")).toBeLessThan(
      types.indexOf("fun-facts")
    )
  })

  it("attaches statistics payloads to sections", () => {
    const statistics = buildStatistics()
    const data = assembleWrappedData({
      output: buildValidOutput(),
      statistics,
      ...BASE_ARGS,
    })

    const topMovies = data.sections.find((s) => s.type === "top-movies")
    expect(topMovies?.data).toEqual({ movies: statistics.topMovies })

    const streaks = data.sections.find((s) => s.type === "streaks-patterns")
    expect(streaks?.data).toEqual({ derived: statistics.derived })

    const hero = data.sections.find((s) => s.type === "hero")
    expect(hero?.data).toMatchObject({
      prominentStat: { value: 1008, label: "hours watched" },
    })

    const finale = data.sections.find((s) => s.type === "finale")
    expect(finale?.data).toMatchObject({
      topMovies: statistics.topMovies.slice(0, 5),
    })
  })

  it("carries insights and summary through unchanged", () => {
    const output = buildValidOutput()
    const data = assembleWrappedData({
      output,
      statistics: buildStatistics(),
      ...BASE_ARGS,
    })

    expect(data.insights).toEqual(output.insights)
    expect(data.summary).toBe(output.summary)
    const funFacts = data.sections.find((s) => s.type === "fun-facts")
    expect(funFacts?.data).toEqual({ facts: output.insights.funFacts })
  })
})
