/**
 * Tests for lib/cleanup/schema/upstream.ts: the Zod projections of TS 7.2.3
 * against the recorded-shape fixtures of lib/cleanup/__tests__/fixtures.
 * Undeclared fields drop, so names, emails and IP addresses never pass.
 */

import {
  arrDiskSchema,
  arrImportListSchema,
  arrRootFolderSchema,
  arrTagSchema,
  historyPageSchema,
  historyRowSchema,
  plexChildrenSchema,
  plexCollectionItemRow,
  plexCollectionRow,
  plexEpisodeRow,
  plexMetadataSchema,
  plexMovieRow,
  plexPageSchema,
  plexPartFiles,
  plexSeasonRow,
  plexSectionSchema,
  plexSessionsSchema,
  plexShowRow,
  radarrMovieSchema,
  recentHistoryRowSchema,
  seerrRequestPageSchema,
  seerrRequestSchema,
  sonarrEpisodeFileSchema,
  sonarrEpisodeSchema,
  sonarrFileCount,
  sonarrSeriesFullSchema,
  sonarrSeriesSchema,
} from "@/lib/cleanup/schema/upstream"

import diskspace from "../../__tests__/fixtures/arr-diskspace.json"
import importLists from "../../__tests__/fixtures/arr-importlist.json"
import rootFolders from "../../__tests__/fixtures/arr-rootfolder.json"
import tags from "../../__tests__/fixtures/arr-tag.json"
import collectionItems from "../../__tests__/fixtures/plex-collection-items.json"
import collections from "../../__tests__/fixtures/plex-collections.json"
import episodesPage from "../../__tests__/fixtures/plex-episodes-page.json"
import metadata from "../../__tests__/fixtures/plex-metadata.json"
import moviesPage from "../../__tests__/fixtures/plex-movies-page.json"
import seasonChildren from "../../__tests__/fixtures/plex-season-children.json"
import seasonsPage from "../../__tests__/fixtures/plex-seasons-page.json"
import sections from "../../__tests__/fixtures/plex-sections.json"
import sessions from "../../__tests__/fixtures/plex-sessions.json"
import showsPage from "../../__tests__/fixtures/plex-shows-page.json"
import radarrMovieList from "../../__tests__/fixtures/radarr-movie-list.json"
import radarrMovie from "../../__tests__/fixtures/radarr-movie.json"
import requestPage from "../../__tests__/fixtures/seerr-request-page.json"
import episodeFiles from "../../__tests__/fixtures/sonarr-episodefile.json"
import sonarrEpisodes from "../../__tests__/fixtures/sonarr-episodes.json"
import seriesFull from "../../__tests__/fixtures/sonarr-series-full.json"
import seriesList from "../../__tests__/fixtures/sonarr-series-list.json"
import historyPage from "../../__tests__/fixtures/tautulli-history-page.json"

/** Words of the fixtures that must never pass a projection. */
const PRIVATE = /example\.test|192\.0\.2\.|viewer-one|viewer-two|server-owner|redacted-token|Living room/

describe("Plex projections", () => {
  it("keeps a section's key, type, title, agent and folders", () => {
    const parsed = sections.MediaContainer.Directory.map((row) => plexSectionSchema.parse(row))

    expect(parsed[0]).toEqual({ key: "1", type: "movie", title: "Movies", agent: "tv.plex.agents.movie", Location: [{ path: "/data/movies" }] })
    expect(parsed.map((s) => s.type)).toEqual(["movie", "show", "movie", "artist"])
  })

  it("keeps a movie's ids, Label tags and files, and drops the rest", () => {
    const [labelled, plain, legacy] = moviesPage.MediaContainer.Metadata.map((row) => plexMovieRow.parse(row))

    expect(labelled).toEqual({
      ratingKey: "101",
      title: "The Lantern Keeper",
      year: 2014,
      addedAt: 1700000000,
      guid: "plex://movie/5d7768aa96b655001fdc0101",
      Guid: [{ id: "imdb://tt9900101" }, { id: "tmdb://990101" }],
      Label: [{ tag: "Untranscodable" }],
      Media: [{ Part: [{ file: "/data/movies/The Lantern Keeper (2014)/The Lantern Keeper (2014).mkv", size: 8589934592 }] }],
    })
    expect(plain.Label).toEqual([])
    expect(legacy.Guid).toEqual([])
    expect(legacy.guid).toBe("com.plexapp.agents.imdb://tt9900103?lang=en")
    expect(labelled).not.toHaveProperty("summary")
    expect(labelled).not.toHaveProperty("Role")
  })

  it("keeps a show's ids and labels, a season's parent and index, an episode's keys and files", () => {
    const show = plexShowRow.parse(showsPage.MediaContainer.Metadata[0])
    const season = plexSeasonRow.parse(seasonsPage.MediaContainer.Metadata[2])
    const episode = plexEpisodeRow.parse(episodesPage.MediaContainer.Metadata[0])

    expect(show.Label).toEqual([{ tag: "Kids" }])
    expect(show.Guid).toHaveLength(3)
    expect(show).not.toHaveProperty("Media")
    expect(season).toEqual({ ratingKey: "303", parentRatingKey: "202", index: 0, addedAt: 1710000000 })
    expect(episode).toMatchObject({ ratingKey: "401", parentRatingKey: "301", grandparentRatingKey: "201", index: 1, parentIndex: 1 })
    expect(plexPartFiles(episode)).toEqual(["/data/tv/Paper Moon Station/Season 01/Paper Moon Station - S01E01.mkv"])
  })

  it("reads number-like strings and refuses a rating key that is not digits", () => {
    expect(plexSeasonRow.parse({ ratingKey: 7, parentRatingKey: "8", index: "2", addedAt: "1700000000" })).toEqual({
      ratingKey: "7",
      parentRatingKey: "8",
      index: 2,
      addedAt: 1700000000,
    })
    expect(plexSeasonRow.safeParse({ ratingKey: "7/../1", parentRatingKey: "8" }).success).toBe(false)
  })

  it("keeps a collection's key, title, count and smart flag", () => {
    const [own, smart] = collections.MediaContainer.Metadata.map((row) => plexCollectionRow.parse(row))

    expect(own).toEqual({ ratingKey: "501", title: "Leaving soon", childCount: 1, smart: false })
    expect(smart.smart).toBe(1)
    expect(plexCollectionItemRow.parse(collectionItems.MediaContainer.Metadata[0])).toEqual({ ratingKey: "101", type: "movie" })
  })

  it("parses a listing page loosely, with empty lists by default", () => {
    expect(plexPageSchema.parse({ MediaContainer: { size: "0" } })).toEqual({ MediaContainer: { size: 0, Metadata: [], Directory: [] } })
    expect(plexPageSchema.parse(moviesPage).MediaContainer.totalSize).toBe(3)
  })

  it("reads an item's metadata with its section and files, and needs one row", () => {
    const item = plexMetadataSchema.parse(metadata).MediaContainer.Metadata[0]

    expect(item).toMatchObject({ ratingKey: "101", type: "movie", librarySectionID: "1" })
    expect(plexPartFiles(item)).toHaveLength(1)
    expect(plexMetadataSchema.safeParse({ MediaContainer: { Metadata: [] } }).success).toBe(false)
  })

  it("reads a season's children with their files", () => {
    const children = plexChildrenSchema.parse(seasonChildren).MediaContainer.Metadata

    expect(children.flatMap(plexPartFiles)).toEqual([
      "/data/tv/Paper Moon Station/Season 01/Paper Moon Station - S01E01.mkv",
      "/data/tv/Paper Moon Station/Season 01/Paper Moon Station - S01E02.mkv",
    ])
    expect(plexChildrenSchema.parse({ MediaContainer: { size: 0 } }).MediaContainer.Metadata).toEqual([])
  })

  it("keeps only the keys of each session, in any id form", () => {
    const parsed = plexSessionsSchema.parse(sessions)

    expect(parsed.MediaContainer.Metadata).toEqual([
      { ratingKey: "101" },
      { ratingKey: "402", parentRatingKey: "301", grandparentRatingKey: "201" },
      { ratingKey: "invented-live-1" },
    ])
    expect(JSON.stringify(parsed)).not.toMatch(PRIVATE)
  })
})

describe("Tautulli projections", () => {
  const rows = historyPage.response.data.data

  it("keeps the play fields and drops the user, player and address", () => {
    const row = historyRowSchema.parse(rows[0])

    expect(row).toEqual({
      row_id: "9001",
      reference_id: "9001",
      user_id: 9400001,
      started: 1730000000,
      stopped: 1730006300,
      play_duration: 6200,
      percent_complete: 98,
      watched_status: 1,
      media_type: "movie",
      rating_key: "101",
      parent_rating_key: null,
      grandparent_rating_key: null,
      guid: "plex://movie/5d7768aa96b655001fdc0101",
      live: 0,
    })
    expect(JSON.stringify(rows.map((r) => historyRowSchema.parse(r)))).not.toMatch(PRIVATE)
  })

  it("reads Tautulli's empty strings as null and its partial watched states", () => {
    const row = historyRowSchema.parse(rows[2])

    expect(row.watched_status).toBe(0.25)
    expect(historyRowSchema.parse({ ...rows[0], guid: "", row_id: "" })).toMatchObject({ guid: null, row_id: null })
    expect(historyRowSchema.safeParse({ ...rows[0], watched_status: 2 }).success).toBe(false)
    expect(historyRowSchema.safeParse({ ...rows[0], live: 2 }).success).toBe(false)
  })

  it("accepts a live session row only in the pre-delete form", () => {
    const live = { ...rows[0], row_id: null, reference_id: null, stopped: null }

    expect(historyRowSchema.safeParse(live).success).toBe(false)
    expect(recentHistoryRowSchema.parse(live)).toMatchObject({ row_id: null, stopped: null })
  })

  it("reads a datatables page and a flat array", () => {
    expect(historyPageSchema.parse(historyPage.response.data)).toMatchObject({ recordsFiltered: 3 })
    expect(historyPageSchema.parse([rows[0]])).toHaveLength(1)
  })
})

describe("Overseerr projections", () => {
  it("keeps the request ids, status, type, media ids and seasons, never the requester's details", () => {
    const page = seerrRequestPageSchema.parse(requestPage)
    const [movie, tv, declined] = page.results.map((row) => seerrRequestSchema.parse(row))

    expect(page.pageInfo).toMatchObject({ page: 1, pages: 1 })
    expect(movie).toEqual({
      id: 61,
      status: 2,
      type: "movie",
      is4k: false,
      createdAt: "2024-03-01T10:00:00.000Z",
      requestedBy: { id: 2 },
      media: { tmdbId: 990101, tvdbId: null },
      seasons: [],
    })
    expect(tv).toMatchObject({ media: { tmdbId: 880201, tvdbId: 770201 }, seasons: [{ seasonNumber: 2 }] })
    expect(declined).toMatchObject({ status: 3, is4k: true })
    expect(JSON.stringify([movie, tv, declined])).not.toMatch(PRIVATE)
  })

  it("accepts a request with no requester", () => {
    expect(seerrRequestSchema.parse({ ...requestPage.results[0], requestedBy: null }).requestedBy).toBeNull()
  })
})

describe("Radarr projections", () => {
  it("keeps the ids, path, files, size, tags and dates of a movie", () => {
    const movie = radarrMovieSchema.parse(radarrMovie)

    expect(movie).toEqual({
      id: 11,
      title: "The Lantern Keeper",
      year: 2014,
      titleSlug: "the-lantern-keeper-990101",
      tmdbId: 990101,
      imdbId: "tt9900101",
      path: "/data/movies/The Lantern Keeper (2014)",
      rootFolderPath: "/data/movies",
      monitored: true,
      hasFile: true,
      movieFileId: 1101,
      sizeOnDisk: 8589934592,
      statistics: { sizeOnDisk: 8589934592 },
      added: "2023-11-14T22:13:20Z",
      tags: [1],
      status: "released",
    })
  })

  it("parses a movie without an IMDb id or tags", () => {
    const [, , noImdb] = radarrMovieList.map((row) => radarrMovieSchema.parse(row))
    const { tags: _tags, ...untagged } = radarrMovie

    expect(noImdb.imdbId).toBeUndefined()
    expect(noImdb.hasFile).toBe(false)
    expect(radarrMovieSchema.parse(untagged).tags).toEqual([])
  })
})

describe("Sonarr projections", () => {
  const [paper, copper] = seriesList.map((row) => sonarrSeriesSchema.parse(row))

  it("keeps the ids, path, status, tags and season statistics of a series", () => {
    expect(paper).toMatchObject({ id: 21, tvdbId: 770201, tmdbId: 880201, imdbId: "tt9900201", status: "continuing", tags: [1] })
    expect(paper.seasons[0]).toEqual({ seasonNumber: 1, monitored: false, statistics: { episodeFileCount: 2, sizeOnDisk: 2147483648 } })
    expect(paper).not.toHaveProperty("network")
    expect(copper.seasons[2].statistics).toBeUndefined()
  })

  it.each(["continuing", "ended", "upcoming", "deleted"])("keeps the status %s", (status) => {
    expect(sonarrSeriesSchema.parse({ ...seriesList[0], status }).status).toBe(status)
  })

  it.each(["returning", "", 3, null])("reads an unknown status %p as deleted", (status) => {
    expect(sonarrSeriesSchema.parse({ ...seriesList[0], status }).status).toBe("deleted")
  })

  it("parses a season whose statistics is null", () => {
    const seasons = [{ seasonNumber: 1, monitored: true, statistics: null }]

    expect(sonarrSeriesSchema.parse({ ...seriesList[0], seasons }).seasons[0].statistics).toBeNull()
  })

  it("keeps every field of the full series, for the PUT that sends it back", () => {
    const full = sonarrSeriesFullSchema.parse(seriesFull)

    expect(full).toEqual(seriesFull)
    expect(full).toHaveProperty("addOptions")
    expect(full.seasons[0]).toHaveProperty("statistics")
    expect(sonarrSeriesFullSchema.safeParse({ ...seriesFull, seasons: undefined }).success).toBe(false)
  })

  it("keeps the episode file paths and the episode flags", () => {
    expect(sonarrEpisodeFileSchema.parse(episodeFiles[0])).toEqual({
      id: 2101,
      seriesId: 21,
      seasonNumber: 1,
      path: "/data/tv/Paper Moon Station/Season 01/Paper Moon Station - S01E01.mkv",
      size: 1073741824,
    })
    expect(sonarrEpisodeSchema.parse(sonarrEpisodes[1])).toEqual({
      id: 3102,
      seriesId: 21,
      seasonNumber: 1,
      episodeNumber: 2,
      episodeFileId: 2102,
      hasFile: true,
      monitored: false,
    })
  })
})

describe("sonarrFileCount", () => {
  const series = (seasons: { seasonNumber: number; statistics?: { episodeFileCount: number; sizeOnDisk: number } | null }[]) => ({
    seasons: seasons.map((season) => ({ monitored: true, ...season })),
  })

  it("sums the seasons from 1 up for a show, and one season for a season", () => {
    const [paper] = seriesList.map((row) => sonarrSeriesSchema.parse(row))

    expect(sonarrFileCount(paper)).toBe(3)
    expect(sonarrFileCount(paper, 2)).toBe(1)
    expect(sonarrFileCount(paper, 9)).toBe(0)
  })

  it("leaves the specials out of the show count", () => {
    const [, copper] = seriesList.map((row) => sonarrSeriesSchema.parse(row))

    expect(sonarrFileCount(copper)).toBe(1)
    expect(sonarrFileCount(copper, 0)).toBe(1)
  })

  it("counts a season whose statistics is null or missing as 0", () => {
    const s = series([
      { seasonNumber: 1, statistics: null },
      { seasonNumber: 2 },
      { seasonNumber: 3, statistics: { episodeFileCount: 4, sizeOnDisk: 1 } },
    ])

    expect(sonarrFileCount(s)).toBe(4)
    expect(sonarrFileCount(s, 1)).toBe(0)
  })
})

describe("Radarr and Sonarr small lists", () => {
  it("keeps the root folder paths, tag labels, import-list tags and disk space", () => {
    expect(arrRootFolderSchema.parse(rootFolders)).toEqual([{ path: "/data/movies" }])
    expect(arrTagSchema.parse(tags)).toEqual([{ id: 1, label: "keep" }, { id: 2, label: "list-import" }])
    expect(arrImportListSchema.parse(importLists)).toEqual([{ tags: [2] }])
    expect(arrDiskSchema.parse(diskspace)[0]).toEqual({ path: "/data", freeSpace: 1099511627776, totalSpace: 8796093022208 })
    expect(JSON.stringify(arrImportListSchema.parse(importLists))).not.toMatch(/redacted-token/)
  })

  it("gives an import list without tags an empty list", () => {
    expect(arrImportListSchema.parse([{ name: "Invented list" }])).toEqual([{ tags: [] }])
  })
})
