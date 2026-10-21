import type { ServerAggregate } from "@/lib/wrapped/aggregate/schema"
import type { AggregateView } from "@/lib/wrapped/stats/metadata"
import type { LibraryTitle } from "@/lib/wrapped/stats/next-year"
import { computePopular } from "@/lib/wrapped/stats/popular"

const libraryTitle = (ratingKey: string, type: "movie" | "show", title: string, contentRating: string | null = "PG"): LibraryTitle => ({
  ratingKey,
  type,
  title,
  year: 2024,
  addedAt: null,
  contentRating,
  genres: [],
  directors: [],
  actors: [],
})

const LIBRARY = [
  libraryTitle("77", "show", "Severance"),
  libraryTitle("9", "movie", "Dune: Part Two"),
  libraryTitle("12", "show", "The Great British Bake Off"),
  libraryTitle("40", "movie", "Oppenheimer", "R"),
]

function view(titles: ServerAggregate["titles"]): AggregateView {
  return {
    userId: "u1",
    aggregate: {
      members: [],
      titles,
      community: { hours: null, topSeries: null, busiestNight: null, peakConcurrent: null, requestsFulfilled: null, titlesAdded: { total: 0, films: 0, series: 0 } },
    },
  }
}

const TITLES: ServerAggregate["titles"] = {
  "series:77": { viewers: 6, minutes: [600, 300, 100, 50, 20, 10] },
  "film:9": { viewers: 4, minutes: [160, 160, 150, 140] },
  "series:12": { viewers: 4, minutes: [900, 400, 300, 100] },
  "film:40": { viewers: 5, minutes: [180, 180, 180, 180, 180] },
}

const none = { hiddenKeys: new Set<string>() }

describe("computePopular (postcard)", () => {
  it("lists up to three titles by viewers, then minutes, named by the library", () => {
    expect(computePopular(view(TITLES), LIBRARY, none, [])).toEqual([
      { key: "series:77", title: "Severance" },
      { key: "film:40", title: "Oppenheimer" },
      { key: "series:12", title: "The Great British Bake Off" },
    ])
  })

  it("skips hidden titles and excluded content ratings", () => {
    expect(computePopular(view(TITLES), LIBRARY, { hiddenKeys: new Set(["77"]) }, ["r"]).map((t) => t.title)).toEqual([
      "The Great British Bake Off",
      "Dune: Part Two",
    ])
  })

  it("is empty without the aggregate or the library", () => {
    expect(computePopular(null, LIBRARY, none, [])).toEqual([])
    expect(computePopular(view(TITLES), null, none, [])).toEqual([])
  })
})
