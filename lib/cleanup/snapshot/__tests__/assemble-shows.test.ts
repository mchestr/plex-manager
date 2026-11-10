/** @jest-environment node */
/**
 * Show and season items (TS 7.4, 7.5): assembly from the fixtures, season
 * positions, `arr.fileCount` with specials left out, the season numbering
 * check (E22), the season causes, copies and each Sonarr state.
 */

import tags from "@/lib/cleanup/__tests__/fixtures/arr-tag.json"
import episodesPage from "@/lib/cleanup/__tests__/fixtures/plex-episodes-page.json"
import seasonsPage from "@/lib/cleanup/__tests__/fixtures/plex-seasons-page.json"
import showsPage from "@/lib/cleanup/__tests__/fixtures/plex-shows-page.json"
import sonarrList from "@/lib/cleanup/__tests__/fixtures/sonarr-series-list.json"
import { type ArrRead, sonarrView } from "@/lib/cleanup/identity/arr"
import { toTitleCopy } from "@/lib/cleanup/identity/copies"
import { type ShowStore, toEpisodeCopy, toSeasonCopy } from "@/lib/cleanup/identity/episodes"
import { snapshotItemSchema, type SnapshotItem, type SourceState } from "@/lib/cleanup/schema/snapshot"
import { arrTagSchema, plexEpisodeRow, plexSeasonRow, plexShowRow, type SonarrSeries, sonarrSeriesSchema } from "@/lib/cleanup/schema/upstream"
import { assembleShows } from "@/lib/cleanup/snapshot/assemble-shows"

const fixtureSeries = sonarrList.map((raw) => sonarrSeriesSchema.parse(raw))
const read = (records: SonarrSeries[]): ArrRead<SonarrSeries> => ({
  records, rootFolders: [{ path: "/data/tv" }], tags: arrTagSchema.parse(tags), importLists: [], disk: [],
})

function fixtureStore(): ShowStore {
  const store: ShowStore = { shows: new Map(), seasons: new Map(), episodes: new Map() }
  for (const raw of showsPage.MediaContainer.Metadata) store.shows.set(String(raw.ratingKey), toTitleCopy("2", plexShowRow.parse(raw), "show"))
  for (const raw of seasonsPage.MediaContainer.Metadata) store.seasons.set(String(raw.ratingKey), toSeasonCopy("2", plexSeasonRow.parse(raw)))
  for (const raw of episodesPage.MediaContainer.Metadata) store.episodes.set(String(raw.ratingKey), toEpisodeCopy("2", plexEpisodeRow.parse(raw)))
  return store
}

const find = (items: SnapshotItem[], key: string) => {
  const item = items.find((i) => i.key === key)
  if (!item) throw new Error(`no item ${key}`)
  return item
}

/** A small store of one invented show (rating key 801, TVDB 9) with `seasons[n]` episodes in season n, each with its own file. */
function inventedStore(seasons: Record<number, number>, sectionId = "2", showKey = "801", folder = "/data/tv/Invented Show"): ShowStore {
  const store: ShowStore = { shows: new Map(), seasons: new Map(), episodes: new Map() }
  addCopy(store, seasons, sectionId, showKey, folder)
  return store
}

function addCopy(store: ShowStore, seasons: Record<number, number>, sectionId: string, showKey: string, folder: string): void {
  store.shows.set(showKey, toTitleCopy(sectionId, plexShowRow.parse({ ratingKey: showKey, title: "Invented Show", Guid: [{ id: "tvdb://9" }] }), "show"))
  for (const [n, count] of Object.entries(seasons)) {
    const seasonKey = `${showKey}${n}`
    store.seasons.set(seasonKey, toSeasonCopy(sectionId, plexSeasonRow.parse({ ratingKey: seasonKey, parentRatingKey: showKey, index: Number(n) })))
    for (let e = 1; e <= count; e++) {
      const ratingKey = `${seasonKey}0${e}`
      store.episodes.set(ratingKey, toEpisodeCopy(sectionId, plexEpisodeRow.parse({ ratingKey, parentRatingKey: seasonKey, grandparentRatingKey: showKey,
        addedAt: 1_700_000_000 + Number(ratingKey), Media: [{ Part: [{ file: `${folder}/S${n}/E${e}.mkv`, size: 100 }] }] })))
    }
  }
}

/** A Sonarr series for the invented show whose season n has `counts[n]` files. */
const inventedSeries = (counts: Record<number, number | null>, overrides: Record<string, unknown> = {}) => sonarrSeriesSchema.parse({
  id: 90, title: "Invented Show", titleSlug: "invented-show", tvdbId: 9, path: "/data/tv/Invented Show", status: "continuing", monitored: false,
  added: "2024-01-01T00:00:00Z", tags: [1],
  seasons: Object.entries(counts).map(([n, c]) => ({ seasonNumber: Number(n), monitored: true, statistics: c === null ? null : { episodeFileCount: c, sizeOnDisk: c * 100 } })),
  statistics: { episodeFileCount: Object.values(counts).reduce<number>((s, c) => s + (c ?? 0), 0), sizeOnDisk: 1 },
  ...overrides,
})

const assemble = (store: ShowStore, records: SonarrSeries[], state: SourceState = "ok") => assembleShows(store, sonarrView(state, read(records)))

describe("assembleShows from the fixtures", () => {
  const { shows, seasons, onDisk } = assemble(fixtureStore(), fixtureSeries)

  it("gives the shows and their seasons from 1 up, and every item parses", () => {
    expect(shows.map((s) => s.key)).toEqual(["show:tvdb:770201", "show:tvdb:770202"])
    expect(seasons.map((s) => s.key)).toEqual(["season:tvdb:770201:1", "season:tvdb:770201:2", "season:tvdb:770202:1"])
    for (const item of [...shows, ...seasons]) expect(snapshotItemSchema.parse(item)).toEqual(item)
  })

  it("fills a matched show from Plex and Sonarr", () => {
    expect(find(shows, "show:tvdb:770201")).toEqual({
      key: "show:tvdb:770201", level: "show", titleKey: "tvdb:770201", title: "Paper Moon Station", year: 2016, seasonNumber: null, showKey: null,
      sectionId: "2", ratingKey: "201", copies: [{ ratingKey: "201", sectionId: "2" }], episodeKeys: ["401", "402", "403"],
      ids: { imdb: "tt9900201", tmdb: 880201, tvdb: 770201, plex: "plex://show/5d9c086fe9d5a1001f4d0201" },
      added: { plex: 1690000000, arr: 1689995200 }, sizeBytes: 3328599654, episodeCount: 3, match: { state: "matched", by: "tvdb" },
      arr: { service: "sonarr", id: 21, titleSlug: "paper-moon-station", path: "/data/tv/Paper Moon Station", root: "/data/tv", tags: ["keep"],
        importList: false, monitored: true, fileCount: 3 },
      show: { status: "continuing", seasonsOnDisk: 2, newestSeasonOnDisk: 2, lastEpisodeAddedAt: 1700000000 },
      position: null, plays: null, requests: null, collections: [], labels: ["kids"],
    })
  })

  it("fills the seasons with positions, sizes and file counts", () => {
    expect(find(seasons, "season:tvdb:770201:1")).toMatchObject({
      seasonNumber: 1, showKey: "show:tvdb:770201", sectionId: "2", ratingKey: "301", copies: [{ ratingKey: "301", sectionId: "2" }],
      episodeKeys: ["401", "402"], episodeCount: 2, sizeBytes: 2147483648, position: 2, added: { plex: 1690000000, arr: 1689995200 },
      arr: { fileCount: 2 }, show: { seasonsOnDisk: 2, newestSeasonOnDisk: 2, lastEpisodeAddedAt: 1690000100 }, labels: [], match: { state: "matched" },
    })
    expect(find(seasons, "season:tvdb:770201:2")).toMatchObject({ position: 1, episodeKeys: ["403"], arr: { fileCount: 1 }, sizeBytes: 1181116006 })
  })

  it("leaves the specials out of the items, the episode count and the file count", () => {
    expect(find(shows, "show:tvdb:770202")).toMatchObject({
      episodeKeys: ["404", "405"], episodeCount: 1, arr: { fileCount: 1 }, sizeBytes: 1825361100,
      show: { status: "ended", seasonsOnDisk: 1, newestSeasonOnDisk: 1, lastEpisodeAddedAt: 1710000100 },
    })
    expect(find(seasons, "season:tvdb:770202:1")).toMatchObject({ position: 1, episodeCount: 1, arr: { fileCount: 1 } })
    expect(onDisk.get("show:tvdb:770202")).toEqual(new Set(["s1e1"]))
    expect(onDisk.get("season:tvdb:770201:1")).toEqual(new Set(["s1e1", "s1e2"]))
  })
})

describe("the season numbering check", () => {
  it("gives every season seasonMismatch for TMDB order in Plex against TVDB order in Sonarr, and keeps the show matched", () => {
    const { shows, seasons } = assemble(inventedStore({ 1: 2, 2: 2 }), [inventedSeries({ 1: 4 })])
    expect(shows[0].match).toEqual({ state: "matched", by: "tvdb" })
    expect(seasons.map((s) => [s.key, s.match])).toEqual([
      ["season:tvdb:9:1", { state: "notManaged", cause: "seasonMismatch", by: "tvdb" }],
      ["season:tvdb:9:2", { state: "notManaged", cause: "noArrSeason", by: "tvdb" }],
    ])
  })

  it("gives seasonMismatch when one season's count differs", () => {
    const { seasons } = assemble(inventedStore({ 1: 2, 2: 2 }), [inventedSeries({ 1: 2, 2: 3 })])
    expect(seasons.every((s) => s.match.state === "notManaged" && s.match.cause === "seasonMismatch")).toBe(true)
  })

  it("matches every season with equal numbering", () => {
    const { seasons } = assemble(inventedStore({ 1: 2, 2: 2 }), [inventedSeries({ 0: 1, 1: 2, 2: 2 })])
    expect(seasons.map((s) => s.match.state)).toEqual(["matched", "matched"])
  })

  it("gives noArrFile to a season that only another Plex copy holds while Sonarr has no file for it", () => {
    const store = inventedStore({ 1: 2 })
    addCopy(store, { 1: 2, 2: 1 }, "5", "851", "/data/tv-other/Invented Show")
    const { shows, seasons } = assemble(store, [inventedSeries({ 1: 2, 2: 0 })])
    expect(shows[0]).toMatchObject({ sectionId: "2", ratingKey: "801", copies: [{ ratingKey: "801" }, { ratingKey: "851" }] })
    expect(seasons.map((s) => [s.key, s.ratingKey, s.match.cause, s.copies.length])).toEqual([
      ["season:tvdb:9:1", "8011", undefined, 2],
      ["season:tvdb:9:2", "8512", "noArrFile", 1],
    ])
  })

  it("fences the season files: an episode listed under the season but not under the show", () => {
    const store = inventedStore({ 1: 1 })
    store.episodes.set("8019", toEpisodeCopy("2", plexEpisodeRow.parse({ ratingKey: "8019", parentRatingKey: "8011", grandparentRatingKey: "899",
      Media: [{ Part: [{ file: "/srv/elsewhere/E9.mkv" }] }] })))
    const { seasons } = assemble(store, [inventedSeries({ 1: 1 })])
    expect(seasons[0].match).toEqual({ state: "notManaged", cause: "outsideArrPath", by: "tvdb" })
  })
})

describe("the show match", () => {
  it("gives noArrFile when Sonarr has no episode file", () => {
    const { shows, seasons } = assemble(inventedStore({ 1: 1 }), [inventedSeries({ 1: 0 }, { statistics: null })])
    expect(shows[0].match).toEqual({ state: "notManaged", cause: "noArrFile", by: "tvdb" })
    expect(seasons[0].match).toEqual(shows[0].match)
    expect(shows[0].arr).toMatchObject({ fileCount: 0, tags: ["keep"], monitored: false })
  })

  it("gives outsideRoot for a series path equal to its root folder", () => {
    const { shows } = assemble(inventedStore({ 1: 1 }, "2", "801", "/data/tv"), [inventedSeries({ 1: 1 }, { path: "/data/tv" })])
    expect(shows[0].match.cause).toBe("outsideRoot")
  })

  it("gives outsideArrPath for an episode file outside the series path", () => {
    const { shows } = assemble(inventedStore({ 1: 1 }, "2", "801", "/data/tv/Another Show"), [inventedSeries({ 1: 1 })])
    expect(shows[0]).toMatchObject({ match: { state: "notManaged", cause: "outsideArrPath" }, sizeBytes: 1 })
  })

  it("leaves a show without episode files and Sonarr record unmatched, with Plex facts", () => {
    const store = inventedStore({ 1: 1 })
    const { shows, seasons } = assemble(store, [])
    expect(shows[0]).toMatchObject({
      match: { state: "unmatched", cause: "noArrRecord" }, arr: null, added: { arr: null }, sizeBytes: 100, position: null,
      show: { status: null, seasonsOnDisk: null, newestSeasonOnDisk: null, lastEpisodeAddedAt: 1_700_801_101 },
    })
    expect(seasons[0]).toMatchObject({ match: { state: "unmatched", cause: "noArrRecord" }, position: null, sizeBytes: 100 })
  })

  it("gives unknown with arrFailed and no show facts when Sonarr failed", () => {
    const { shows, seasons } = assemble(inventedStore({ 1: 1 }), [inventedSeries({ 1: 1 })], "failed")
    for (const item of [shows[0], seasons[0]]) {
      expect(item).toMatchObject({ match: { state: "unknown", cause: "arrFailed" }, arr: null, show: null, position: null, added: { arr: null } })
      expect(snapshotItemSchema.safeParse(item).success).toBe(true)
    }
  })

  it("gives no season item without a season number or an episode with a file", () => {
    const store = inventedStore({ 1: 1 })
    store.seasons.set("8015", toSeasonCopy("2", plexSeasonRow.parse({ ratingKey: "8015", parentRatingKey: "801" })))
    store.seasons.set("8016", toSeasonCopy("2", plexSeasonRow.parse({ ratingKey: "8016", parentRatingKey: "801", index: 6 })))
    store.episodes.set("80161", toEpisodeCopy("2", plexEpisodeRow.parse({ ratingKey: "80161", parentRatingKey: "8016", grandparentRatingKey: "801" })))
    expect(assemble(store, [inventedSeries({ 1: 1 })]).seasons.map((s) => s.key)).toEqual(["season:tvdb:9:1"])
  })
})
