/** @jest-environment node */
/** The facts of a read (TS 7.7) and its users (TS 7.6): access, libraries, disk, growth, import lists and collections. */

import { buildMovieItem, buildSeasonItem, buildShowItem } from "@/lib/cleanup/__tests__/helpers/builders"
import diskspace from "@/lib/cleanup/__tests__/fixtures/arr-diskspace.json"
import sections from "@/lib/cleanup/__tests__/fixtures/plex-sections.json"
import { radarrView, sonarrView } from "@/lib/cleanup/identity/arr"
import { toTitleCopy } from "@/lib/cleanup/identity/copies"
import type { ShowStore } from "@/lib/cleanup/identity/episodes"
import { snapshotFactsSchema } from "@/lib/cleanup/schema/snapshot"
import { arrDiskSchema, plexMovieRow, plexSectionSchema, plexShowRow, radarrMovieSchema } from "@/lib/cleanup/schema/upstream"
import { toMovieCopy } from "@/lib/cleanup/snapshot/assemble-movies"
import { buildFacts, buildUsers, collectionTitles, diskFacts, type FactsInput, growthPerMonth } from "@/lib/cleanup/snapshot/facts"

const SECTIONS = sections.MediaContainer.Directory.map((raw) => plexSectionSchema.parse(raw))
const DISK = arrDiskSchema.parse(diskspace)
const radarrRecord = (id: number, tags: number[]) => radarrMovieSchema.parse({
  id, title: "Invented", titleSlug: `invented-${id}`, tmdbId: id, path: `/data/movies/Invented ${id}`, monitored: true, added: "2024-01-01T00:00:00Z", tags,
})

describe("buildUsers", () => {
  const lastPlays = new Map([["100", 1_700_000_000], ["300", null]])

  it("gives access to the access list (a managed Home user too) and the owner, and none to others", () => {
    const users = buildUsers({ access: ["100", "200"], ownerId: "1", lastPlays, requesters: ["400"] })
    expect(users).toEqual({
      "1": { hasAccess: true, lastPlayAt: null, owner: true },
      "100": { hasAccess: true, lastPlayAt: 1_700_000_000, owner: false },
      "200": { hasAccess: true, lastPlayAt: null, owner: false },
      "300": { hasAccess: false, lastPlayAt: null, owner: false },
      "400": { hasAccess: false, lastPlayAt: null, owner: false },
    })
  })

  it("gives null to everyone when the share list failed", () => {
    const users = buildUsers({ access: null, ownerId: "1", lastPlays, requesters: [] })
    expect(Object.values(users).map((u) => u.hasAccess)).toEqual([null, null, null])
    expect(users["1"].owner).toBe(true)
  })

  it.each([[null], ["admin-plex-id"]])("gives null to everyone with the owner id %s", (ownerId) => {
    const users = buildUsers({ access: ["100"], ownerId, lastPlays: null, requesters: ["not-digits"] })
    expect(users).toEqual({ "100": { hasAccess: null, lastPlayAt: null, owner: false } })
  })
})

describe("diskFacts", () => {
  it("takes the longest disk path that holds each root, once per path", () => {
    const radarr = radarrView("ok", { records: [], rootFolders: [{ path: "/data/movies" }], tags: [], importLists: [], disk: DISK })
    const sonarr = sonarrView("ok", { records: [], rootFolders: [{ path: "/data/tv" }, { path: "/srv/tv" }], tags: [], importLists: [], disk: DISK })
    expect(diskFacts([radarr, sonarr])).toEqual({ freeBytes: 1099511627776 + 53687091200, totalBytes: 8796093022208 + 107374182400 })
    expect(diskFacts([radarr])).toEqual({ freeBytes: 1099511627776, totalBytes: 8796093022208 })
  })

  it("is null when no arr answered or no disk holds a root", () => {
    expect(diskFacts([radarrView("failed", null)])).toBeNull()
    expect(diskFacts([radarrView("ok", { records: [], rootFolders: [{ path: "/data/movies" }], tags: [], importLists: [], disk: [] })])).toBeNull()
  })
})

describe("growthPerMonth", () => {
  it("sums what Plex added in the last 182 days and divides by 6", () => {
    const takenAt = "2024-07-10T00:00:00.000Z"
    const since = Date.parse(takenAt) / 1000 - 182 * 86_400
    expect(growthPerMonth(takenAt, [{ addedAt: since, size: 600 }, { addedAt: since - 1, size: 6000 }, { addedAt: null, size: 60 },
      { addedAt: since + 5, size: null }, { addedAt: since + 9, size: 7 }])).toBe(101)
  })
})

describe("collectionTitles", () => {
  const show = buildShowItem()
  const s1 = buildSeasonItem(show, 1, { copies: [{ ratingKey: "7001", sectionId: "2" }], episodeKeys: ["7101"] })
  const s2 = buildSeasonItem(show, 2, { copies: [{ ratingKey: "7002", sectionId: "2" }], episodeKeys: ["7201"] })
  const members = new Map([["6001", new Set(["Shows we love"])], ["7002", new Set(["Halloween"])], ["7101", new Set(["Pilots"])],
    ["5001", new Set(["Halloween", "Award winners"])]])
  const titles = collectionTitles({ shows: [show], seasons: [s1, s2] }, members)

  it("reads a movie's copy keys", () => {
    expect(titles(buildMovieItem())).toEqual(["Award winners", "Halloween"])
  })

  it("gives a show the titles of its copies and of everything inside it", () => {
    expect(titles(show)).toEqual(["Halloween", "Shows we love"])
  })

  it("gives a season its own titles and its show copies', not another season's", () => {
    expect(titles(s1)).toEqual(["Pilots", "Shows we love"])
    expect(titles(s2)).toEqual(["Halloween", "Shows we love"])
    expect(titles(buildSeasonItem(show, 3, { showKey: null, copies: [{ ratingKey: "7003", sectionId: "2" }], episodeKeys: [] }))).toEqual([])
  })
})

describe("buildFacts", () => {
  const store: ShowStore = { shows: new Map(), seasons: new Map(), episodes: new Map() }
  const showCopy = toTitleCopy("2", plexShowRow.parse({ ratingKey: "6001", title: "S", Guid: [{ id: "tvdb://2002" }] }), "show")
  store.shows.set(showCopy.ratingKey, showCopy)
  const movies = [
    toMovieCopy("1", plexMovieRow.parse({ ratingKey: "5001", title: "M", Guid: [{ id: "tmdb://1001" }], addedAt: 1_790_000_000,
      Media: [{ Part: [{ file: "/data/movies/M/m.mkv", size: 6000 }] }] })),
    toMovieCopy("3", plexMovieRow.parse({ ratingKey: "5101", title: "M", guid: "local://5101" })),
  ]
  const movie = buildMovieItem()
  const unmatched = buildMovieItem({ key: "movie:tmdb:2", match: { state: "unmatched", cause: "noArrRecord" }, sizeBytes: 5 })
  const show = buildShowItem()
  const input: FactsInput = {
    takenAt: "2026-11-08T12:00:00.000Z",
    sections: SECTIONS,
    movies,
    store,
    items: { movie: [movie, unmatched], show: [show], season: [buildSeasonItem(show, 1), buildSeasonItem(show, 2, { match: { state: "unknown" } })] },
    radarr: radarrView("ok", { records: [radarrRecord(1, [2]), radarrRecord(2, [1])], rootFolders: [{ path: "/data/movies" }], tags: [],
      importLists: [{ tags: [2] }], disk: DISK }),
    sonarr: sonarrView("failed", null),
    history: { startAt: 1, newestAt: 2, rows: 3, orphans: 0, usersWithPlay: 1 },
    users: { "100": { hasAccess: true, lastPlayAt: 2, owner: false } },
    collections: [{ sectionId: "1", ratingKey: "9001", title: "Halloween", childCount: 2, smart: false }],
    membersRead: ["Halloween"],
    labelsRead: ["1"],
    machineIdentifier: "invented-machine",
  }
  const facts = buildFacts(input)

  it("parses with the facts schema", () => {
    expect(snapshotFactsSchema.parse(facts)).toEqual(facts)
  })

  it("gives one library per movie or show section", () => {
    expect(facts.libraries).toEqual([
      { sectionId: "1", title: "Movies", type: "movie", agent: "tv.plex.agents.movie", locations: ["/data/movies"], arr: "radarr", noIds: false,
        items: 1, seasons: 0, bytes: movie.sizeBytes },
      { sectionId: "2", title: "TV Shows", type: "show", agent: "tv.plex.agents.series", locations: ["/data/tv"], arr: null, noIds: false,
        items: 1, seasons: 1, bytes: show.sizeBytes },
      { sectionId: "3", title: "Movies 4K", type: "movie", agent: "tv.plex.agents.movie", locations: ["/data/movies4k"], arr: null, noIds: true,
        items: 0, seasons: 0, bytes: 0 },
    ])
  })

  it("finds an overlap in either direction and the none agent", () => {
    const wide = plexSectionSchema.parse({ key: "8", type: "movie", title: "All", agent: "com.plexapp.agents.none", Location: [{ path: "/data" }] })
    const [library] = buildFacts({ ...input, sections: [wide] }).libraries
    expect(library).toMatchObject({ arr: "radarr", noIds: true, agent: "com.plexapp.agents.none" })
  })

  it("counts import lists, disk and growth, and keeps the given facts", () => {
    expect(facts).toMatchObject({
      version: 1, takenAt: input.takenAt, importListCount: { radarr: 1, sonarr: 0 }, disk: { freeBytes: 1099511627776, totalBytes: 8796093022208 },
      growthBytesPerMonth: 1000, machineIdentifier: "invented-machine", labelsRead: ["1"], membersRead: ["Halloween"], rowBaseline: {},
      history: input.history, users: input.users, collections: input.collections,
    })
  })
})
