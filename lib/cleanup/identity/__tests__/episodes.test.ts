/** @jest-environment node */
/** Plex seasons and episodes of a show: copies, season numbers and the parts of one show title. */

import episodesPage from "@/lib/cleanup/__tests__/fixtures/plex-episodes-page.json"
import seasonsPage from "@/lib/cleanup/__tests__/fixtures/plex-seasons-page.json"
import showsPage from "@/lib/cleanup/__tests__/fixtures/plex-shows-page.json"
import { toTitleCopy } from "@/lib/cleanup/identity/copies"
import { indexShows, seasonNumberOf, type ShowStore, showParts, toEpisodeCopy, toSeasonCopy } from "@/lib/cleanup/identity/episodes"
import { plexEpisodeRow, plexSeasonRow, plexShowRow } from "@/lib/cleanup/schema/upstream"

function fixtureStore(): ShowStore {
  const store: ShowStore = { shows: new Map(), seasons: new Map(), episodes: new Map() }
  for (const raw of showsPage.MediaContainer.Metadata) {
    const copy = toTitleCopy("2", plexShowRow.parse(raw), "show")
    store.shows.set(copy.ratingKey, copy)
  }
  for (const raw of seasonsPage.MediaContainer.Metadata) {
    const season = toSeasonCopy("2", plexSeasonRow.parse(raw))
    store.seasons.set(season.ratingKey, season)
  }
  for (const raw of episodesPage.MediaContainer.Metadata) {
    const episode = toEpisodeCopy("2", plexEpisodeRow.parse(raw))
    store.episodes.set(episode.ratingKey, episode)
  }
  return store
}

describe("copies", () => {
  it("reads a season row with its number", () => {
    expect(toSeasonCopy("2", plexSeasonRow.parse({ ratingKey: "301", parentRatingKey: "201", index: 1, addedAt: 1690000000 }))).toEqual({
      ratingKey: "301", sectionId: "2", showRatingKey: "201", index: 1, addedAt: 1690000000,
    })
  })

  it.each([[undefined], [-1], [1.5]])("gives no season number for an index of %s", (index) => {
    expect(toSeasonCopy("2", plexSeasonRow.parse({ ratingKey: "301", parentRatingKey: "201", index })).index).toBeNull()
  })

  it("reads an episode row with its files and size", () => {
    const store = fixtureStore()
    expect(store.episodes.get("401")).toEqual({
      ratingKey: "401", sectionId: "2", seasonRatingKey: "301", showRatingKey: "201", parentIndex: 1, index: 1,
      guid: "plex://episode/5d9c1276e9d5a1001f4e0401", addedAt: 1690000000,
      files: ["/data/tv/Paper Moon Station/Season 01/Paper Moon Station - S01E01.mkv"], size: 1073741824,
    })
  })
})

describe("seasonNumberOf", () => {
  it("reads the season row, else the episode's parent index", () => {
    const store = fixtureStore()
    const episode = store.episodes.get("404")
    if (!episode) throw new Error("fixture episode 404")
    expect(seasonNumberOf(store, episode)).toBe(0)
    expect(seasonNumberOf(store, { ...episode, seasonRatingKey: "999", parentIndex: 4 })).toBe(4)
    expect(seasonNumberOf(store, { ...episode, seasonRatingKey: "999", parentIndex: null })).toBeNull()
  })
})

describe("showParts", () => {
  it("gives the episodes of each copy and season, and the seasons from 1 up by number", () => {
    const store = fixtureStore()
    const index = indexShows(store)
    const copies = [...store.shows.values()].filter((show) => show.ratingKey === "202")
    const parts = showParts(store, index, copies)
    expect(parts.episodes.map((e) => e.ratingKey)).toEqual(["404", "405"])
    expect(parts.episodesOf("202").map((e) => e.ratingKey)).toEqual(["404", "405"])
    expect(parts.episodesOf("999")).toEqual([])
    expect(parts.seasonsByNumber().map(([n, seasons]) => [n, seasons.map((s) => s.ratingKey)])).toEqual([[1, ["304"]]])
    expect(parts.episodesOfSeasons(parts.seasonsByNumber()[0][1]).map((e) => e.ratingKey)).toEqual(["405"])
    expect(parts.seasonOf(parts.episodes[0])).toBe(0)
  })

  it("sorts the season numbers and leaves out the seasons of other shows", () => {
    const store = fixtureStore()
    store.seasons.set("309", { ratingKey: "309", sectionId: "2", showRatingKey: "201", index: 10, addedAt: null })
    const copies = [...store.shows.values()].filter((show) => show.ratingKey === "201")
    expect(showParts(store, indexShows(store), copies).seasonsByNumber().map(([n]) => n)).toEqual([1, 2, 10])
  })
})
