/** @jest-environment node */
/**
 * `createSnapshotBuilder()` end to end on the recorded fixtures (TS 7.3 to
 * 7.8): items and facts that parse, the 4K copy whose plays count, history,
 * requests, users and access, labels, collections, and each source failure.
 */

import { buildSourceStatuses } from "@/lib/cleanup/__tests__/helpers/builders"
import diskspace from "@/lib/cleanup/__tests__/fixtures/arr-diskspace.json"
import importLists from "@/lib/cleanup/__tests__/fixtures/arr-importlist.json"
import rootFolders from "@/lib/cleanup/__tests__/fixtures/arr-rootfolder.json"
import tags from "@/lib/cleanup/__tests__/fixtures/arr-tag.json"
import collectionItems from "@/lib/cleanup/__tests__/fixtures/plex-collection-items.json"
import collectionsPage from "@/lib/cleanup/__tests__/fixtures/plex-collections.json"
import episodesPage from "@/lib/cleanup/__tests__/fixtures/plex-episodes-page.json"
import moviesPage from "@/lib/cleanup/__tests__/fixtures/plex-movies-page.json"
import seasonsPage from "@/lib/cleanup/__tests__/fixtures/plex-seasons-page.json"
import sections from "@/lib/cleanup/__tests__/fixtures/plex-sections.json"
import showsPage from "@/lib/cleanup/__tests__/fixtures/plex-shows-page.json"
import radarrList from "@/lib/cleanup/__tests__/fixtures/radarr-movie-list.json"
import requestPage from "@/lib/cleanup/__tests__/fixtures/seerr-request-page.json"
import seerrUsers from "@/lib/cleanup/__tests__/fixtures/seerr-users-page.json"
import sonarrList from "@/lib/cleanup/__tests__/fixtures/sonarr-series-list.json"
import historyPage from "@/lib/cleanup/__tests__/fixtures/tautulli-history-page.json"
import type { ArrRead } from "@/lib/cleanup/identity/arr"
import { type SnapshotItem, snapshotFactsSchema, snapshotItemSchema, type SourceStatus } from "@/lib/cleanup/schema/snapshot"
import {
  arrDiskSchema, arrImportListSchema, arrRootFolderSchema, arrTagSchema, historyRowSchema, plexCollectionItemRow, plexCollectionRow, plexEpisodeRow,
  plexMovieRow, plexSeasonRow, plexSectionSchema, plexShowRow, type RadarrMovie, radarrMovieSchema, seerrRequestSchema, type SonarrSeries,
  sonarrSeriesSchema,
} from "@/lib/cleanup/schema/upstream"
import { createSnapshotBuilder, type SnapshotBuilder, type SnapshotFinishInput } from "@/lib/cleanup/snapshot/builder"
import type { Service } from "@/lib/validations/cleanup-vocabulary"

const TAKEN_AT = "2024-07-10T00:00:00.000Z"
const rows = <T>(parse: (raw: unknown) => T, list: readonly unknown[]) => list.map(parse)
const movieRows = rows((r) => plexMovieRow.parse(r), moviesPage.MediaContainer.Metadata)
const fourK = plexMovieRow.parse({ ...moviesPage.MediaContainer.Metadata[0], ratingKey: "151", Label: [{ tag: "4K" }],
  Media: [{ Part: [{ file: "/data/movies4k/The Lantern Keeper (2014)/The Lantern Keeper (2014).mkv", size: 30_000_000_000 }] }] })
const historyRows = rows((r) => historyRowSchema.parse(r), historyPage.response.data.data)
// A play of the 4K copy, which is outside the fence but still counts for the movie.
const fourKPlay = historyRowSchema.parse({ ...historyPage.response.data.data[0], row_id: 9004, user_id: 9400003, started: 1730300000, rating_key: 151,
  guid: "" })
const OVERSEERR_USERS = new Map(seerrUsers.results.map((u) => [u.plexId, u.id]))

const arr = <R>(records: R[], roots: { path: string }[]): ArrRead<R> => ({
  records, rootFolders: roots, tags: arrTagSchema.parse(tags), importLists: arrImportListSchema.parse(importLists), disk: arrDiskSchema.parse(diskspace),
})
const RADARR = arr<RadarrMovie>(radarrList.map((r) => radarrMovieSchema.parse(r)), arrRootFolderSchema.parse(rootFolders))
const SONARR = arr<SonarrSeries>(sonarrList.map((r) => sonarrSeriesSchema.parse(r)), [{ path: "/data/tv" }])

function sources(overrides: Partial<Record<Service, Partial<SourceStatus>>> = {}, shares: SourceStatus["state"] = "ok"): SourceStatus[] {
  const list = buildSourceStatuses(overrides)
  return [...list, { service: "plex", part: "shares", state: shares, readAt: list[0].readAt }]
}

function filled(): SnapshotBuilder {
  const builder = createSnapshotBuilder({ takenAt: TAKEN_AT, sections: rows((r) => plexSectionSchema.parse(r), sections.MediaContainer.Directory) })
  builder.addMovies("1", movieRows)
  builder.addMovies("3", [fourK])
  builder.addShows("2", rows((r) => plexShowRow.parse(r), showsPage.MediaContainer.Metadata))
  builder.addSeasons("2", rows((r) => plexSeasonRow.parse(r), seasonsPage.MediaContainer.Metadata))
  builder.addEpisodes("2", rows((r) => plexEpisodeRow.parse(r), episodesPage.MediaContainer.Metadata))
  builder.addCollections("1", rows((r) => plexCollectionRow.parse(r), collectionsPage.MediaContainer.Metadata))
  builder.addCollectionMembers("Leaving soon", rows((r) => plexCollectionItemRow.parse(r), collectionItems.MediaContainer.Metadata))
  builder.addHistory(historyRows)
  builder.addHistory([fourKPlay])
  builder.addRequests(rows((r) => seerrRequestSchema.parse(r), requestPage.results))
  return builder
}

const finishInput = (overrides: Partial<SnapshotFinishInput> = {}): SnapshotFinishInput => ({
  sources: sources(),
  access: { userIds: ["9400001", "9400003"], ownerId: "9400000", machineIdentifier: "invented-machine" },
  radarr: RADARR,
  sonarr: SONARR,
  overseerrUsers: OVERSEERR_USERS,
  ...overrides,
})

const byKey = (items: SnapshotItem[], key: string) => {
  const item = items.find((i) => i.key === key)
  if (!item) throw new Error(`no item ${key}`)
  return item
}

describe("createSnapshotBuilder on the fixtures", () => {
  const { items, facts } = filled().finish(finishInput())

  it("gives items of each level and facts that parse", () => {
    expect(items.movie.map((i) => i.key)).toEqual(["movie:imdb:tt9900103", "movie:tmdb:990101", "movie:tmdb:990102"])
    expect(items.show.map((i) => i.key)).toEqual(["show:tvdb:770201", "show:tvdb:770202"])
    expect(items.season.map((i) => i.key)).toEqual(["season:tvdb:770201:1", "season:tvdb:770201:2", "season:tvdb:770202:1"])
    for (const item of [...items.movie, ...items.show, ...items.season]) expect(snapshotItemSchema.parse(item)).toEqual(item)
    expect(snapshotFactsSchema.parse(facts)).toEqual(facts)
  })

  it("manages the 1080p copy and counts the plays of the 4K copy", () => {
    const lantern = byKey(items.movie, "movie:tmdb:990101")
    expect(lantern).toMatchObject({ sectionId: "1", ratingKey: "101", match: { state: "matched", by: "tmdb" }, labels: ["4k", "untranscodable"],
      collections: ["Leaving soon"] })
    expect(lantern.copies).toEqual([{ ratingKey: "101", sectionId: "1" }, { ratingKey: "151", sectionId: "3" }])
    expect(lantern.plays).toEqual({
      lastCountedAt: 1730300000, countedAt: [1730000000, 1730300000],
      viewers: [
        { user: "9400001", lastCountedAt: 1730000000, lastCountedFinished: true, counted: 1, finished: true, finishedEpisodes: 0 },
        { user: "9400003", lastCountedAt: 1730300000, lastCountedFinished: true, counted: 1, finished: true, finishedEpisodes: 0 },
      ],
    })
  })

  it("maps episode plays to the season and the show, with finished episodes", () => {
    const viewer = { user: "9400002", lastCountedAt: 1730100000, lastCountedFinished: true, counted: 1, finished: false, finishedEpisodes: 1 }
    expect(byKey(items.show, "show:tvdb:770201").plays?.viewers).toEqual([viewer])
    expect(byKey(items.season, "season:tvdb:770201:1").plays?.viewers).toEqual([viewer])
    expect(byKey(items.season, "season:tvdb:770201:2").plays).toEqual({ lastCountedAt: null, countedAt: [], viewers: [] })
    expect(byKey(items.season, "season:tvdb:770202:1").plays?.viewers[0]).toMatchObject({ user: "9400001", counted: 1, finished: false })
  })

  it("attaches requests by id, filters seasons and drops the declined one", () => {
    expect(byKey(items.movie, "movie:tmdb:990101").requests).toEqual([
      { at: Date.parse("2024-03-01T10:00:00.000Z") / 1000, by: "9400001", status: 2, is4k: false, seasons: null },
    ])
    expect(byKey(items.movie, "movie:tmdb:990102").requests).toEqual([])
    expect(byKey(items.show, "show:tvdb:770201").requests).toHaveLength(1)
    expect(byKey(items.season, "season:tvdb:770201:1").requests).toEqual([])
    expect(byKey(items.season, "season:tvdb:770201:2").requests?.[0]).toMatchObject({ by: "9400002", seasons: [2] })
  })

  it("lists the users with access from the share list and the owner", () => {
    expect(facts.users).toEqual({
      "9400000": { hasAccess: true, lastPlayAt: null, owner: true },
      "9400001": { hasAccess: true, lastPlayAt: 1730200000, owner: false },
      "9400002": { hasAccess: false, lastPlayAt: 1730100000, owner: false },
      "9400003": { hasAccess: true, lastPlayAt: 1730300000, owner: false },
    })
  })

  it("fills the history, labels, collections and libraries", () => {
    expect(facts.history).toEqual({ startAt: 1730000000, newestAt: 1730300000, rows: 4, orphans: 0, usersWithPlay: 3 })
    expect(facts.labelsRead).toEqual(["1", "2", "3"])
    expect(facts.membersRead).toEqual(["Leaving soon"])
    expect(facts.collections).toEqual([
      { sectionId: "1", ratingKey: "501", title: "Leaving soon", childCount: 1, smart: false },
      { sectionId: "1", ratingKey: "502", title: "Recently added", childCount: 12, smart: true },
    ])
    expect(facts.libraries.map((l) => [l.sectionId, l.arr, l.noIds, l.items, l.seasons])).toEqual([
      ["1", "radarr", false, 2, 0], ["2", "sonarr", false, 2, 3], ["3", null, false, 0, 0],
    ])
    expect(facts).toMatchObject({ takenAt: TAKEN_AT, machineIdentifier: "invented-machine", importListCount: { radarr: 1, sonarr: 0 },
      disk: { freeBytes: 1099511627776, totalBytes: 8796093022208 }, rowBaseline: {} })
    expect(facts.growthBytesPerMonth).toBe(Math.round((4294967296 + 536870912 + 1288490188) / 6))
  })
})

describe("the source failures of TS 7.8", () => {
  it("gives plays null and an empty history when Tautulli failed", () => {
    const { items, facts } = filled().finish(finishInput({ sources: sources({ tautulli: { state: "failed", errorCode: "TIMEOUT" } }) }))
    expect([...items.movie, ...items.show, ...items.season].every((i) => i.plays === null)).toBe(true)
    expect(facts.history).toEqual({ startAt: null, newestAt: null, rows: 0, orphans: 0, usersWithPlay: 0 })
    expect(Object.values(facts.users).every((u) => u.lastPlayAt === null)).toBe(true)
  })

  it("gives requests null when Overseerr failed or is not set up", () => {
    for (const state of ["failed", "notConfigured"] as const) {
      const { items } = filled().finish(finishInput({ sources: sources({ overseerr: { state } }) }))
      expect([...items.movie, ...items.show, ...items.season].every((i) => i.requests === null)).toBe(true)
    }
  })

  it("gives movies unknown with arrFailed when Radarr failed", () => {
    const { items, facts } = filled().finish(finishInput({ sources: sources({ radarr: { state: "failed" } }) }))
    expect(items.movie.every((i) => i.match.state === "unknown" && i.match.cause === "arrFailed" && i.arr === null && i.added.arr === null)).toBe(true)
    expect(items.show.every((i) => i.match.state === "matched")).toBe(true)
    expect(facts.libraries[0]).toMatchObject({ arr: null, items: 0 })
  })

  it("gives shows and seasons unknown with no show facts when Sonarr failed or sent no data", () => {
    for (const input of [finishInput({ sources: sources({ sonarr: { state: "failed" } }) }), finishInput({ sonarr: null })]) {
      const { items } = filled().finish(input)
      expect([...items.show, ...items.season].every((i) => i.match.cause === "arrFailed" && i.show === null && i.arr === null)).toBe(true)
    }
  })

  it("gives hasAccess null for every user when the share list failed or no owner id is stored", () => {
    for (const input of [finishInput({ sources: sources({}, "failed") }), finishInput({ access: { userIds: null, ownerId: "9400000",
      machineIdentifier: null } }), finishInput({ access: { userIds: ["9400001"], ownerId: null, machineIdentifier: null } })]) {
      const { facts } = filled().finish(input)
      expect(Object.values(facts.users).every((u) => u.hasAccess === null)).toBe(true)
    }
  })

  it("reads a missing source status as failed", () => {
    const { items } = filled().finish(finishInput({ sources: [] }))
    expect(items.movie[0]).toMatchObject({ plays: null, requests: null, match: { state: "unknown", cause: "arrFailed" } })
  })
})

describe("streaming", () => {
  it("keeps the first row of a repeated rating key and reads Plex pages in any order", () => {
    const builder = createSnapshotBuilder({ takenAt: TAKEN_AT, sections: [] })
    builder.addEpisodes("2", rows((r) => plexEpisodeRow.parse(r), episodesPage.MediaContainer.Metadata))
    builder.addSeasons("2", rows((r) => plexSeasonRow.parse(r), seasonsPage.MediaContainer.Metadata))
    builder.addShows("2", rows((r) => plexShowRow.parse(r), showsPage.MediaContainer.Metadata))
    builder.addMovies("1", movieRows)
    builder.addMovies("1", [{ ...movieRows[0], title: "A later copy of the row" }])
    builder.addCollections("1", [plexCollectionRow.parse({ ratingKey: "501", title: "Again" })])
    builder.addCollectionMembers("Gone", null)
    builder.addCollectionMembers("Gone", [plexCollectionItemRow.parse({ ratingKey: "101" })])
    const { items, facts } = builder.finish(finishInput())
    expect(byKey(items.movie, "movie:tmdb:990101")).toMatchObject({ title: "The Lantern Keeper", collections: ["Gone"] })
    expect(items.season).toHaveLength(3)
    expect(facts).toMatchObject({ membersRead: [], libraries: [], collections: [{ ratingKey: "501", title: "Again", childCount: 0, smart: false }] })
    expect(facts.history.rows).toBe(0)
  })

  it("refuses a Plex row after the history", () => {
    const builder = createSnapshotBuilder({ takenAt: TAKEN_AT, sections: [] })
    builder.addHistory(historyRows)
    expect(() => builder.addMovies("1", movieRows)).toThrow("after the history")
    expect(() => builder.addSeasons("2", [])).toThrow("after the history")
    expect(() => builder.addEpisodes("2", [])).toThrow("after the history")
    expect(builder.finish(finishInput()).facts.history.orphans).toBe(3)
  })

  it("leaves a section without Label tags out of labelsRead", () => {
    const builder = createSnapshotBuilder({ takenAt: TAKEN_AT, sections: [] })
    builder.addMovies("1", [{ ...movieRows[1], Label: [] }])
    expect(builder.finish(finishInput()).facts.labelsRead).toEqual([])
  })
})
