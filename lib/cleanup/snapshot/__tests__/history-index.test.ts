/** @jest-environment node */
/**
 * The history index (TS 7.6): history by key, guid and parent key, with and
 * without `?lang=`, a repeated `row_id`, orphans, finished episodes, specials
 * and `usersWithPlay`.
 */

import { toTitleCopy } from "@/lib/cleanup/identity/copies"
import { type ShowStore, toEpisodeCopy, toSeasonCopy } from "@/lib/cleanup/identity/episodes"
import { type HistoryRow, historyRowSchema, plexEpisodeRow, plexMovieRow, plexSeasonRow, plexShowRow, sonarrSeriesSchema } from "@/lib/cleanup/schema/upstream"
import { toMovieCopy } from "@/lib/cleanup/snapshot/assemble-movies"
import { assembleShows } from "@/lib/cleanup/snapshot/assemble-shows"
import { sonarrView } from "@/lib/cleanup/identity/arr"
import { buildHistoryMaps, createHistoryIndex } from "@/lib/cleanup/snapshot/history-index"

const MOVIE = "movie:tmdb:1"
const SHOW = "show:tvdb:7"
const S1 = "season:tvdb:7:1"

function library() {
  const file = (path: string) => [{ Part: [{ file: path, size: 10 }] }]
  const movies = [
    toMovieCopy("1", plexMovieRow.parse({ ratingKey: "101", title: "A", guid: "com.plexapp.agents.imdb://tt1?lang=en", Guid: [{ id: "tmdb://1" }],
      Media: file("/data/movies/A/a.mkv") })),
    toMovieCopy("3", plexMovieRow.parse({ ratingKey: "151", title: "A", guid: "plex://movie/a4k", Guid: [{ id: "tmdb://1" }],
      Media: file("/data/movies4k/A/a.mkv") })),
  ]
  const store: ShowStore = { shows: new Map(), seasons: new Map(), episodes: new Map() }
  const show = toTitleCopy("2", plexShowRow.parse({ ratingKey: "201", title: "S", Guid: [{ id: "tvdb://7" }] }), "show")
  store.shows.set(show.ratingKey, show)
  for (const [ratingKey, index] of [["300", 0], ["301", 1], ["302", undefined]] as const) {
    store.seasons.set(ratingKey, toSeasonCopy("2", plexSeasonRow.parse({ ratingKey, parentRatingKey: "201", index })))
  }
  const episode = (ratingKey: string, season: string, guid: string, index?: number) => {
    const copy = toEpisodeCopy("2", plexEpisodeRow.parse({ ratingKey, parentRatingKey: season, grandparentRatingKey: "201", guid, index,
      Media: file(`/data/tv/S/${ratingKey}.mkv`) }))
    store.episodes.set(ratingKey, copy)
  }
  episode("400", "300", "plex://episode/special", 1)
  episode("401", "301", "com.plexapp.agents.thetvdb://7/1/1?lang=en", 1)
  episode("402", "301", "plex://episode/402", 2)
  episode("403", "302", "plex://episode/403", 1)
  episode("499", "999", "plex://episode/orphan-season")
  return { movies, store }
}

let rowId = 0
function row(overrides: Partial<Record<keyof HistoryRow, unknown>>): HistoryRow {
  rowId += 1
  return historyRowSchema.parse({
    row_id: rowId, reference_id: rowId, user_id: 100, started: 1_700_000_000 + rowId, stopped: 1_700_000_100 + rowId, play_duration: 3000,
    percent_complete: 100, watched_status: 1, media_type: "movie", rating_key: 101, parent_rating_key: "", grandparent_rating_key: "",
    guid: "", live: 0, ...overrides,
  })
}

function indexOf(rows: HistoryRow[]) {
  const { movies, store } = library()
  const index = createHistoryIndex(buildHistoryMaps(movies, store))
  index.add(rows)
  return index
}

const movieItem = { key: MOVIE, level: "movie" as const, episodeCount: null }
const showItem = (episodeCount: number) => ({ key: SHOW, level: "show" as const, episodeCount })
const seasonItem = (episodeCount: number) => ({ key: S1, level: "season" as const, episodeCount })
/** The episode identities of the fixture (`episodeIdentity`): 403's season row has no index, so its guid names it. */
const E401 = "s1e1"
const E402 = "s1e2"
const E403 = "guid:plex://episode/403"

describe("buildHistoryMaps", () => {
  it("maps copies, guids without ?lang=, seasons and episodes", () => {
    const { movies, store } = library()
    const maps = buildHistoryMaps(movies, store)
    expect(maps.movieByKey).toEqual(new Map([["101", MOVIE], ["151", MOVIE]]))
    expect(maps.movieByGuid.get("com.plexapp.agents.imdb://tt1")).toBe(MOVIE)
    expect(maps.showByKey.get("201")).toBe(SHOW)
    expect(maps.seasonByKey.get("300")).toEqual({ showKey: SHOW, seasonKey: null, episodeKey: null, special: true })
    expect(maps.seasonByKey.get("302")).toEqual({ showKey: SHOW, seasonKey: null, episodeKey: null, special: false })
    expect(maps.episodeByKey.get("401")).toEqual({ showKey: SHOW, seasonKey: S1, episodeKey: E401, special: false })
    expect(maps.episodeByGuid.get("com.plexapp.agents.thetvdb://7/1/1")).toMatchObject({ episodeKey: E401 })
    expect(maps.episodeByKey.has("499")).toBe(true)
  })

  it("maps a legacy agent copy with only an IMDb id to the one item of its title (correctness review C-01)", () => {
    const hd = toMovieCopy("1", plexMovieRow.parse({ ratingKey: "100", title: "B", guid: "plex://movie/b", Guid: [{ id: "tmdb://55" }, { id: "imdb://tt0000055" }],
      Media: [{ Part: [{ file: "/data/movies/B/b.mkv", size: 1 }] }] }))
    const uhd = toMovieCopy("3", plexMovieRow.parse({ ratingKey: "300", title: "B", guid: "com.plexapp.agents.imdb://tt0000055?lang=en", Guid: [],
      Media: [{ Part: [{ file: "/data/movies4k/B/b.mkv", size: 1 }] }] }))
    const index = createHistoryIndex(buildHistoryMaps([hd, uhd], { shows: new Map(), seasons: new Map(), episodes: new Map() }))
    index.add([row({ rating_key: 300, started: 1_760_000_000, stopped: 1_760_006_000, guid: "com.plexapp.agents.imdb://tt0000055?lang=en" })])
    expect(index.playsOf({ key: "movie:tmdb:55", level: "movie", episodeCount: null }).lastCountedAt).toBe(1_760_000_000)
  })

  it("leaves out rows of a show that the listing did not hold", () => {
    const { movies, store } = library()
    store.seasons.set("399", toSeasonCopy("2", plexSeasonRow.parse({ ratingKey: "399", parentRatingKey: "999", index: 1 })))
    store.episodes.set("498", toEpisodeCopy("2", plexEpisodeRow.parse({ ratingKey: "498", parentRatingKey: "399", grandparentRatingKey: "999" })))
    const maps = buildHistoryMaps(movies, store)
    expect(maps.seasonByKey.has("399")).toBe(false)
    expect(maps.episodeByKey.has("498")).toBe(false)
  })
})

describe("createHistoryIndex", () => {
  it("counts plays on every copy of a movie, by key and by guid with or without ?lang=", () => {
    const index = indexOf([
      row({ rating_key: 101 }),
      row({ rating_key: 151, user_id: 200 }),
      row({ rating_key: 999, guid: "com.plexapp.agents.imdb://tt1" }),
      row({ rating_key: 998, guid: "com.plexapp.agents.imdb://tt1?lang=de" }),
    ])
    expect(index.playsOf(movieItem).countedAt).toHaveLength(4)
    expect(index.playsOf(movieItem).viewers.map((v) => [v.user, v.counted, v.finished])).toEqual([["100", 3, true], ["200", 1, true]])
    expect(index.stats().orphans).toBe(0)
  })

  it("maps an episode by key, guid, season key and show key", () => {
    const index = indexOf([
      row({ media_type: "episode", rating_key: 402 }),
      row({ media_type: "episode", rating_key: 900, guid: "com.plexapp.agents.thetvdb://7/1/1" }),
      row({ media_type: "episode", rating_key: 901, parent_rating_key: 301 }),
      row({ media_type: "episode", rating_key: 902, parent_rating_key: 777, grandparent_rating_key: 201 }),
    ])
    expect(index.playsOf(showItem(3)).countedAt).toHaveLength(4)
    expect(index.playsOf(seasonItem(2)).countedAt).toHaveLength(3)
    expect(index.playsOf(seasonItem(2), new Set([E401, E402])).viewers[0]).toEqual({
      user: "100", lastCountedAt: expect.any(Number), lastCountedFinished: true, counted: 3, finished: true, finishedEpisodes: 2,
    })
  })

  it("counts a special for the show's plays, never for a season or its finished set", () => {
    const index = indexOf([row({ media_type: "episode", rating_key: 400 })])
    const show = index.playsOf(showItem(3), new Set([E401, E402, E403]))
    expect(show.countedAt).toHaveLength(1)
    expect(show.viewers[0]).toMatchObject({ counted: 1, finishedEpisodes: 0, finished: false })
    expect(index.playsOf(seasonItem(2)).countedAt).toEqual([])
  })

  it("counts finished episodes that are still on disk, and finishes a season once all of them are", () => {
    const index = indexOf([
      row({ media_type: "episode", rating_key: 401 }),
      row({ media_type: "episode", rating_key: 402, percent_complete: 50, watched_status: 0.5 }),
      row({ media_type: "episode", rating_key: 403 }),
    ])
    expect(index.playsOf(seasonItem(2), new Set([E401, E402])).viewers[0]).toMatchObject({ finishedEpisodes: 1, finished: false })
    expect(index.playsOf(seasonItem(1), new Set([E401])).viewers[0]).toMatchObject({ finishedEpisodes: 1, finished: true })
    expect(index.playsOf(showItem(3), new Set([E401, E403])).viewers[0]).toMatchObject({ finishedEpisodes: 2 })
    expect(index.playsOf(seasonItem(0), new Set()).viewers[0]).toMatchObject({ finished: false })
  })

  it("keeps the finished state of the viewer's newest counted play", () => {
    const index = indexOf([
      row({ started: 1_800_000_000, percent_complete: 40, watched_status: 0 }),
      row({ started: 1_700_000_000 }),
    ])
    expect(index.playsOf(movieItem)).toEqual({
      lastCountedAt: 1_800_000_000, countedAt: [1_700_000_000, 1_800_000_000],
      viewers: [{ user: "100", lastCountedAt: 1_800_000_000, lastCountedFinished: false, counted: 2, finished: true, finishedEpisodes: 0 }],
    })
  })

  it("adds no viewer for a play that neither counts nor finishes, and no counted time for a finished short play", () => {
    const index = indexOf([
      row({ play_duration: 30, percent_complete: 10, watched_status: 0, user_id: 300 }),
      row({ play_duration: 30, percent_complete: 50, watched_status: 1, user_id: 400 }),
    ])
    expect(index.playsOf(movieItem)).toEqual({
      lastCountedAt: null, countedAt: [],
      viewers: [{ user: "400", lastCountedAt: null, lastCountedFinished: false, counted: 0, finished: true, finishedEpisodes: 0 }],
    })
    expect(index.lastPlays()).toEqual(new Map([["300", null], ["400", null]]))
    expect(index.stats().usersWithPlay).toBe(0)
  })

  it("drops a repeated row_id and keeps rows without one", () => {
    const first = row({})
    const index = indexOf([first, { ...first }, row({ row_id: "" }), row({ row_id: "" })])
    expect(index.stats().rows).toBe(3)
    expect(index.playsOf(movieItem).countedAt).toHaveLength(3)
  })

  it("counts orphans, skips other media types, and keeps live rows out of the items", () => {
    const index = indexOf([
      row({ rating_key: 555 }),
      row({ media_type: "episode", rating_key: 556, parent_rating_key: 557, grandparent_rating_key: 558 }),
      row({ media_type: "track", rating_key: 559 }),
      row({ live: 1, user_id: 500, started: 1_900_000_000 }),
    ])
    expect(index.stats()).toMatchObject({ rows: 4, orphans: 2, newestAt: 1_900_000_000 })
    expect(index.playsOf(movieItem).countedAt).toEqual([])
    expect(index.lastPlays().get("500")).toBe(1_900_000_000)
  })

  it("gives the history window, users with a counted play and an empty item", () => {
    const index = indexOf([
      row({ started: 1_650_000_000, user_id: 100 }),
      row({ started: 1_750_000_000, user_id: 200 }),
      row({ started: 1_600_000_000, user_id: 300, play_duration: 10, percent_complete: 1, watched_status: 0 }),
      row({ started: 1_700_000_000, user_id: -1 }),
    ])
    expect(index.stats()).toEqual({ startAt: 1_600_000_000, newestAt: 1_750_000_000, rows: 4, orphans: 0, usersWithPlay: 2 })
    expect(index.lastPlays()).toEqual(new Map([["100", 1_650_000_000], ["200", 1_750_000_000], ["300", null]]))
    expect(index.playsOf(movieItem).viewers.map((v) => v.user)).toEqual(["100", "200"])
    expect(index.playsOf({ key: "movie:tmdb:2", level: "movie", episodeCount: null })).toEqual({ lastCountedAt: null, countedAt: [], viewers: [] })
  })

  it("starts empty", () => {
    expect(indexOf([]).stats()).toEqual({ startAt: null, newestAt: null, rows: 0, orphans: 0, usersWithPlay: 0 })
  })
})

describe("a show with two Plex copies (correctness review C-05)", () => {
  /** One copy of a show with 2 episodes in season 1, in `sectionId`. */
  function addCopy(store: ShowStore, sectionId: string, showKey: string, folder: string): void {
    store.shows.set(showKey, toTitleCopy(sectionId, plexShowRow.parse({ ratingKey: showKey, title: "Two Copies", Guid: [{ id: "tvdb://9" }] }), "show"))
    store.seasons.set(`${showKey}1`, toSeasonCopy(sectionId, plexSeasonRow.parse({ ratingKey: `${showKey}1`, parentRatingKey: showKey, index: 1 })))
    for (const index of [1, 2]) {
      store.episodes.set(`${showKey}10${index}`, toEpisodeCopy(sectionId, plexEpisodeRow.parse({ ratingKey: `${showKey}10${index}`, parentRatingKey: `${showKey}1`,
        grandparentRatingKey: showKey, index, parentIndex: 1, Media: [{ Part: [{ file: `${folder}/S1/E${index}.mkv`, size: 100 }] }] })))
    }
  }

  function setUp(rows: [ratingKey: string, show: string][]) {
    const store: ShowStore = { shows: new Map(), seasons: new Map(), episodes: new Map() }
    addCopy(store, "2", "801", "/data/tv/Two Copies")
    addCopy(store, "5", "901", "/data/tv4k/Two Copies")
    const series = sonarrSeriesSchema.parse({ id: 90, title: "Two Copies", titleSlug: "two-copies", tvdbId: 9, path: "/data/tv/Two Copies", status: "ended",
      monitored: false, added: "2024-01-01T00:00:00Z", tags: [], seasons: [{ seasonNumber: 1, monitored: false, statistics: { episodeFileCount: 2, sizeOnDisk: 200 } }],
      statistics: { episodeFileCount: 2, sizeOnDisk: 200 } })
    const assembly = assembleShows(store, sonarrView("ok", { records: [series], rootFolders: [{ path: "/data/tv" }], tags: [], importLists: [], disk: [] }))
    const index = createHistoryIndex(buildHistoryMaps([], store))
    index.add(rows.map(([ratingKey, show]) => row({ media_type: "episode", rating_key: ratingKey, parent_rating_key: `${show}1`, grandparent_rating_key: show })))
    const viewer = (item: (typeof assembly.shows)[number]) => index.playsOf(item, assembly.onDisk.get(item.key)).viewers[0]
    return { show: assembly.shows[0], season: assembly.seasons[0], viewer }
  }

  it("counts each episode once and finishes a viewer who watched every episode of one copy", () => {
    const { show, season, viewer } = setUp([["801101", "801"], ["801102", "801"]])
    expect([show.episodeCount, season.episodeCount]).toEqual([2, 2])
    expect([viewer(show), viewer(season)]).toEqual([expect.objectContaining({ finished: true, finishedEpisodes: 2 }),
      expect.objectContaining({ finished: true, finishedEpisodes: 2 })])
  })

  it("finishes a viewer who watched the episodes across both copies, and never one who watched one episode twice", () => {
    const across = setUp([["801101", "801"], ["901102", "901"]])
    expect(across.viewer(across.show)).toMatchObject({ finished: true, finishedEpisodes: 2 })
    const twice = setUp([["801101", "801"], ["901101", "901"]])
    expect(twice.viewer(twice.show)).toMatchObject({ finished: false, finishedEpisodes: 1 })
  })
})
