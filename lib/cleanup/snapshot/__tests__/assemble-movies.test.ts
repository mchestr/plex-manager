/** @jest-environment node */
/**
 * Movie items (TS 7.4, 7.5): assembly from the fixtures, copies and the
 * managed copy, Movies 4K outside the fence, `outsideRoot` for a path equal
 * to its root, `noArrFile`, `conflictingIds` on a second id, labels and each
 * Radarr state.
 */

import importLists from "@/lib/cleanup/__tests__/fixtures/arr-importlist.json"
import rootFolders from "@/lib/cleanup/__tests__/fixtures/arr-rootfolder.json"
import tags from "@/lib/cleanup/__tests__/fixtures/arr-tag.json"
import moviesPage from "@/lib/cleanup/__tests__/fixtures/plex-movies-page.json"
import radarrList from "@/lib/cleanup/__tests__/fixtures/radarr-movie-list.json"
import { type ArrRead, radarrView } from "@/lib/cleanup/identity/arr"
import { snapshotItemSchema, type SourceState } from "@/lib/cleanup/schema/snapshot"
import {
  arrImportListSchema, arrRootFolderSchema, arrTagSchema, type PlexMovieRow, plexMovieRow, type RadarrMovie, radarrMovieSchema,
} from "@/lib/cleanup/schema/upstream"
import { assembleMovies, toMovieCopy } from "@/lib/cleanup/snapshot/assemble-movies"

const fixtureRows = moviesPage.MediaContainer.Metadata.map((raw) => plexMovieRow.parse(raw))
const fixtureRecords = radarrList.map((raw) => radarrMovieSchema.parse(raw))

function read(records: RadarrMovie[] = fixtureRecords): ArrRead<RadarrMovie> {
  return { records, rootFolders: arrRootFolderSchema.parse(rootFolders), tags: arrTagSchema.parse(tags), importLists: arrImportListSchema.parse(importLists),
    disk: [] }
}

const plexRow = (overrides: Record<string, unknown> = {}): PlexMovieRow => plexMovieRow.parse({
  ratingKey: "501", title: "An Invented Movie", year: 2020, addedAt: 1_700_000_000, guid: "plex://movie/inv", Guid: [{ id: "tmdb://5" }],
  Media: [{ Part: [{ file: "/data/movies/An Invented Movie (2020)/a.mkv", size: 1000 }] }], ...overrides,
})
const record = (overrides: Partial<RadarrMovie> = {}): RadarrMovie => radarrMovieSchema.parse({
  id: 50, title: "An Invented Movie", titleSlug: "an-invented-movie-5", tmdbId: 5, imdbId: null, path: "/data/movies/An Invented Movie (2020)",
  rootFolderPath: "/data/movies", monitored: true, hasFile: true, movieFileId: 77, sizeOnDisk: 900, statistics: { sizeOnDisk: 950 },
  added: "2024-01-01T00:00:00Z", tags: [], ...overrides,
})

function assemble(copies: [string, PlexMovieRow][], records: RadarrMovie[] = [record()], state: SourceState = "ok") {
  return assembleMovies(copies.map(([sectionId, row]) => toMovieCopy(sectionId, row)), radarrView(state, read(records)))
}

describe("assembleMovies from the fixtures", () => {
  const items = assembleMovies(fixtureRows.map((row) => toMovieCopy("1", row)), radarrView("ok", read()))

  it("gives one item per title that parses", () => {
    expect(items.map((item) => item.key)).toEqual(["movie:imdb:tt9900103", "movie:tmdb:990101", "movie:tmdb:990102"])
    for (const item of items) expect(snapshotItemSchema.parse(item)).toEqual(item)
  })

  it("fills a matched movie from Plex and Radarr", () => {
    expect(items[1]).toEqual({
      key: "movie:tmdb:990101", level: "movie", titleKey: "tmdb:990101", title: "The Lantern Keeper", year: 2014, seasonNumber: null, showKey: null,
      sectionId: "1", ratingKey: "101", copies: [{ ratingKey: "101", sectionId: "1" }], episodeKeys: [],
      ids: { imdb: "tt9900101", tmdb: 990101, plex: "plex://movie/5d7768aa96b655001fdc0101" },
      added: { plex: 1700000000, arr: 1700000000 }, sizeBytes: 8589934592, episodeCount: null,
      match: { state: "matched", by: "tmdb" },
      arr: { service: "radarr", id: 11, titleSlug: "the-lantern-keeper-990101", path: "/data/movies/The Lantern Keeper (2014)", root: "/data/movies",
        tags: ["keep"], importList: false, monitored: true, fileId: 1101 },
      show: null, position: null, plays: null, requests: null, collections: [], labels: ["untranscodable"],
    })
  })

  it("marks a record that carries an import-list tag", () => {
    expect(items[2].arr).toMatchObject({ tags: ["list-import"], importList: true })
  })

  it("leaves a legacy agent title that Radarr does not know unmatched", () => {
    expect(items[0]).toMatchObject({ ids: { imdb: "tt9900103" }, match: { state: "unmatched", cause: "noArrRecord" }, arr: null, sizeBytes: 2147483648 })
  })
})

describe("copies and the managed copy", () => {
  const fourK = plexRow({ ratingKey: "551", guid: "plex://movie/inv4k", Media: [{ Part: [{ file: "/data/movies4k/An Invented Movie (2020)/a.mkv" }] }],
    Label: [{ tag: "4K" }], addedAt: 1_750_000_000 })

  it("keeps a Movies 4K copy outside the fence and manages the 1080p copy", () => {
    const [item] = assemble([["3", fourK], ["1", plexRow({ Label: [{ tag: "Untranscodable" }] })]])
    expect(item).toMatchObject({
      sectionId: "1", ratingKey: "501", copies: [{ ratingKey: "501", sectionId: "1" }, { ratingKey: "551", sectionId: "3" }],
      match: { state: "matched", by: "tmdb" }, added: { plex: 1_750_000_000 }, labels: ["4k", "untranscodable"],
    })
  })

  it("takes the lowest section id when two copies pass", () => {
    const [item] = assemble([["7", plexRow({ ratingKey: "570" })], ["2", plexRow({ ratingKey: "520" })]])
    expect(item).toMatchObject({ sectionId: "2", ratingKey: "520", match: { state: "matched" } })
  })

  it("is notManaged when no copy passes, and points at the first copy by section id", () => {
    const [item] = assemble([["3", fourK], ["4", plexRow({ ratingKey: "560", Media: [] })]])
    expect(item).toMatchObject({ sectionId: "3", ratingKey: "551", match: { state: "notManaged", cause: "outsideArrPath", by: "tmdb" } })
    expect(item.arr).toMatchObject({ id: 50, fileId: 77 })
  })

  it("gives noPlexFile for a copy with no file", () => {
    expect(assemble([["1", plexRow({ Media: [] })]])[0].match).toEqual({ state: "notManaged", cause: "noPlexFile", by: "tmdb" })
  })

  it("is conflicted when two copies give two IMDb ids", () => {
    const [item] = assemble([["1", plexRow({ Guid: [{ id: "tmdb://5" }, { id: "imdb://tt1" }] })], ["3", plexRow({ ratingKey: "551",
      Guid: [{ id: "tmdb://5" }, { id: "imdb://tt2" }] })]])
    expect(item).toMatchObject({ match: { state: "conflicted", cause: "conflictingIds" }, arr: null, added: { arr: null } })
  })
})

describe("the Radarr match", () => {
  it("gives outsideRoot for a record path equal to its root folder", () => {
    const [item] = assemble([["1", plexRow({ Media: [{ Part: [{ file: "/data/movies/a.mkv" }] }] })]], [record({ path: "/data/movies" })])
    expect(item.match).toEqual({ state: "notManaged", cause: "outsideRoot", by: "tmdb" })
  })

  it("gives outsideRoot for a record path outside every root folder", () => {
    expect(assemble([["1", plexRow()]], [record({ path: "/srv/movies/An Invented Movie (2020)" })])[0].match.cause).toBe("outsideRoot")
  })

  it("gives noArrFile when Radarr has no file, with the record and no file id", () => {
    const [item] = assemble([["1", plexRow()]], [record({ hasFile: false, movieFileId: 0 })])
    expect(item.match).toEqual({ state: "notManaged", cause: "noArrFile", by: "tmdb" })
    expect(item.arr).not.toHaveProperty("fileId")
    expect(item.arr).toMatchObject({ id: 50 })
  })

  it("is conflicted on a second id: TMDB matches and IMDb differs", () => {
    const [item] = assemble([["1", plexRow({ Guid: [{ id: "tmdb://5" }, { id: "imdb://tt7" }] })]], [record({ imdbId: "tt8" })])
    expect(item).toMatchObject({ match: { state: "conflicted", cause: "conflictingIds" }, arr: null })
  })

  it("is conflicted when two records share the TMDB id", () => {
    expect(assemble([["1", plexRow()]], [record(), record({ id: 51 })])[0].match).toEqual({ state: "conflicted", cause: "twoArrRecords" })
  })

  it("adds the record's IMDb id to a TMDB-only title and keeps the title key", () => {
    const [item] = assemble([["1", plexRow()]], [record({ imdbId: "tt0000005" })])
    expect(item).toMatchObject({ titleKey: "tmdb:5", ids: { tmdb: 5, imdb: "tt0000005" } })
  })

  it.each([
    ["statistics", { statistics: { sizeOnDisk: 950 }, sizeOnDisk: 900 }, 950],
    ["sizeOnDisk", { statistics: null, sizeOnDisk: 900 }, 900],
    ["the managed copy", { statistics: { sizeOnDisk: null }, sizeOnDisk: null }, 1000],
  ])("takes the size from %s", (_name, sizes, expected) => {
    expect(assemble([["1", plexRow()]], [record(sizes)])[0].sizeBytes).toBe(expected)
  })

  it("has no size when nothing knows it", () => {
    const [item] = assemble([["1", plexRow({ Media: [{ Part: [{ file: "/data/movies/An Invented Movie (2020)/a.mkv" }] }] })]],
      [record({ statistics: null, sizeOnDisk: null })])
    expect(item.sizeBytes).toBeNull()
  })

  it("gives unknown with arrFailed when Radarr failed", () => {
    const [item] = assemble([["1", plexRow()]], [record()], "failed")
    expect(item).toMatchObject({ match: { state: "unknown", cause: "arrFailed" }, arr: null, added: { plex: 1_700_000_000, arr: null }, sizeBytes: 1000 })
    expect(snapshotItemSchema.safeParse(item).success).toBe(true)
  })

  it("leaves a movie unmatched when Radarr is not set up", () => {
    expect(assemble([["1", plexRow()]], [record()], "notConfigured")[0].match).toEqual({ state: "unmatched", cause: "noArrRecord" })
  })

  it("leaves a movie with no external id unmatched with noIds", () => {
    const [item] = assemble([["1", plexRow({ guid: "local://501", Guid: [] })]])
    expect(item).toMatchObject({ key: "movie:rk:501", match: { state: "unmatched", cause: "noIds" } })
  })
})
