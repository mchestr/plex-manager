import { rankArchetypes, suggestArchetypes } from "@/lib/wrapped/archetype-scoring"
import { ARCHETYPES } from "@/lib/wrapped/llm-output-schema"
import type { WrappedStatistics } from "@/types/wrapped"

import { buildStatistics } from "./fixtures"

/** Histogram with all minutes concentrated in the given hours. */
function hourHistogram(minutesByHour: Record<number, number>): number[] {
  const histogram = new Array<number>(24).fill(0)
  for (const [hour, minutes] of Object.entries(minutesByHour)) {
    histogram[Number(hour)] = minutes
  }
  return histogram
}

function scoreOf(statistics: WrappedStatistics, id: string): number {
  const entry = rankArchetypes(statistics).find((a) => a.id === id)
  if (!entry) throw new Error(`archetype ${id} missing from ranking`)
  return entry.score
}

describe("rankArchetypes", () => {
  it("returns all archetypes sorted by descending score", () => {
    const ranked = rankArchetypes(buildStatistics())

    expect(ranked).toHaveLength(ARCHETYPES.length)
    for (let i = 1; i < ranked.length; i++) {
      expect(ranked[i - 1].score).toBeGreaterThanOrEqual(ranked[i].score)
    }
  })

  it("keeps every score within 0-100", () => {
    for (const entry of rankArchetypes(buildStatistics())) {
      expect(entry.score).toBeGreaterThanOrEqual(0)
      expect(entry.score).toBeLessThanOrEqual(100)
    }
  })

  it("handles zero watch time without NaN or crashes", () => {
    const ranked = rankArchetypes(
      buildStatistics({
        totalWatchTime: { total: 0, movies: 0, shows: 0 },
        moviesWatched: 0,
        showsWatched: 0,
        episodesWatched: 0,
        topMovies: [],
        topShows: [],
        derived: undefined,
      })
    )

    for (const entry of ranked) {
      expect(Number.isFinite(entry.score)).toBe(true)
      expect(entry.score).toBeGreaterThanOrEqual(0)
    }
  })

  it("handles missing derived stats (time-of-day scorers fall to zero)", () => {
    const ranked = rankArchetypes(buildStatistics({ derived: undefined }))

    expect(scoreOf(buildStatistics({ derived: undefined }), "midnight-marathoner")).toBe(0)
    expect(scoreOf(buildStatistics({ derived: undefined }), "golden-hour-viewer")).toBe(0)
    expect(ranked.find((a) => a.id === "golden-hour-viewer")?.evidence).toBe(
      "no peak hour data"
    )
  })

  it("scores midnight-marathoner from late-night watch share", () => {
    const nightOwl = buildStatistics({
      derived: {
        ...buildStatistics().derived!,
        hourHistogram: hourHistogram({ 23: 500, 0: 400, 1: 300, 14: 100 }),
      },
    })
    const dayViewer = buildStatistics({
      derived: {
        ...buildStatistics().derived!,
        hourHistogram: hourHistogram({ 14: 1000, 15: 300 }),
      },
    })

    expect(scoreOf(nightOwl, "midnight-marathoner")).toBeGreaterThan(
      scoreOf(dayViewer, "midnight-marathoner")
    )
    expect(scoreOf(dayViewer, "midnight-marathoner")).toBe(0)
  })

  it("scores series-devourer higher for show-heavy deep-binge viewing", () => {
    const binger = buildStatistics({
      totalWatchTime: { total: 60000, movies: 6000, shows: 54000 },
      topShows: [
        { title: "One Show", watchTime: 30000, playCount: 80, episodesWatched: 80, year: 2020 },
      ],
    })
    const movieFan = buildStatistics({
      totalWatchTime: { total: 60000, movies: 54000, shows: 6000 },
      topShows: [
        { title: "One Show", watchTime: 300, playCount: 3, episodesWatched: 3, year: 2020 },
      ],
    })

    expect(scoreOf(binger, "series-devourer")).toBeGreaterThan(
      scoreOf(movieFan, "series-devourer")
    )
  })

  it("does not award series-devourer to everyone: a movie-heavy year ranks festival-juror above it", () => {
    const cinephile = buildStatistics({
      totalWatchTime: { total: 30000, movies: 27000, shows: 3000 },
      moviesWatched: 120,
      showsWatched: 3,
      episodesWatched: 12,
      topShows: [
        { title: "One Show", watchTime: 300, playCount: 3, episodesWatched: 3, year: 2020 },
      ],
    })

    expect(scoreOf(cinephile, "festival-juror")).toBeGreaterThan(
      scoreOf(cinephile, "series-devourer")
    )
  })

  it("scores weekend-double-feature from weekend share", () => {
    const base = buildStatistics()
    const weekender = buildStatistics({
      derived: { ...base.derived!, weekendVsWeekday: { weekendPct: 60 } },
    })
    const weekdayViewer = buildStatistics({
      derived: { ...base.derived!, weekendVsWeekday: { weekendPct: 20 } },
    })

    expect(scoreOf(weekender, "weekend-double-feature")).toBeGreaterThan(50)
    expect(scoreOf(weekdayViewer, "weekend-double-feature")).toBe(0)
  })

  it("scores golden-hour-viewer only for a 6-9 PM peak hour", () => {
    const base = buildStatistics()
    const primeTime = buildStatistics({
      derived: {
        ...base.derived!,
        peakHour: { hour: 20, label: "8 PM", plays: 200 },
        hourHistogram: hourHistogram({ 20: 800, 12: 200 }),
      },
    })
    const lateNight = buildStatistics({
      derived: {
        ...base.derived!,
        peakHour: { hour: 23, label: "11 PM", plays: 200 },
        hourHistogram: hourHistogram({ 23: 800, 12: 200 }),
      },
    })

    expect(scoreOf(primeTime, "golden-hour-viewer")).toBeGreaterThan(0)
    expect(scoreOf(lateNight, "golden-hour-viewer")).toBe(0)
  })

  it("scores loyalist when few shows dominate series watch time", () => {
    const loyal = buildStatistics({
      totalWatchTime: { total: 40000, movies: 8000, shows: 32000 },
      topShows: [
        { title: "A", watchTime: 20000, playCount: 40, episodesWatched: 40, year: 2020 },
        { title: "B", watchTime: 8000, playCount: 16, episodesWatched: 16, year: 2021 },
      ],
    })

    expect(scoreOf(loyal, "loyalist")).toBeGreaterThan(50)
  })

  it("scores comfort-rewatcher from repeat movie plays", () => {
    const rewatcher = buildStatistics({
      topMovies: [
        { title: "A", watchTime: 400, playCount: 4, year: 2001 },
        { title: "B", watchTime: 300, playCount: 3, year: 2002 },
        { title: "C", watchTime: 120, playCount: 1, year: 2003 },
      ],
    })

    expect(scoreOf(rewatcher, "comfort-rewatcher")).toBe(50)
    expect(scoreOf(buildStatistics(), "comfort-rewatcher")).toBe(0)
  })

  it("scores casual-critic only for low-volume years", () => {
    const casual = buildStatistics({
      totalWatchTime: { total: 1800, movies: 1200, shows: 600 }, // 30 hours
    })

    expect(scoreOf(casual, "casual-critic")).toBe(60)
    expect(scoreOf(buildStatistics(), "casual-critic")).toBe(0) // 1008 hours
  })

  it("never surfaces signal-less archetypes above scored ones", () => {
    // credits-roller and premiere-chaser have no collected signals
    for (const id of ["credits-roller", "premiere-chaser"]) {
      expect(scoreOf(buildStatistics(), id)).toBe(0)
    }
  })
})

describe("suggestArchetypes", () => {
  it("returns the top 3 by default, best first", () => {
    const statistics = buildStatistics()
    const shortlist = suggestArchetypes(statistics)
    const fullRanking = rankArchetypes(statistics)

    expect(shortlist).toHaveLength(3)
    expect(shortlist).toEqual(fullRanking.slice(0, 3))
  })

  it("respects a custom count", () => {
    expect(suggestArchetypes(buildStatistics(), 5)).toHaveLength(5)
  })

  it("includes evidence text for every candidate", () => {
    for (const candidate of suggestArchetypes(buildStatistics())) {
      expect(candidate.evidence.length).toBeGreaterThan(0)
    }
  })
})
