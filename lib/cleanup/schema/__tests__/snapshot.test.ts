/** The stored library data (TS 3.4): items, facts and source results parse row by row, never throw and log paths only. */

const mockWarn = jest.fn()
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: jest.fn() }),
}))

import {
  buildMovieItem,
  buildSeasonItem,
  buildShowItem,
  buildSnapshotFacts,
  buildSourceStatuses,
} from "@/lib/cleanup/__tests__/helpers/builders"
import {
  issuePaths,
  matchCauseSchema,
  parseStoredRows,
  parseSnapshotFacts,
  parseSnapshotItems,
  parseSourceStatuses,
  snapshotFactsSchema,
  snapshotItemSchema,
  sourceStatusSchema,
} from "@/lib/cleanup/schema/snapshot"

beforeEach(() => mockWarn.mockClear())

describe("snapshotItemSchema", () => {
  it.each([
    ["a movie", buildMovieItem()],
    ["a show", buildShowItem()],
    ["a season", buildSeasonItem(buildShowItem(), 2)],
  ])("parses the builder output of %s", (_name, item) => {
    expect(snapshotItemSchema.parse(item)).toEqual(item)
  })

  it("parses an arr record with and without unmonitored and fileCount", () => {
    const movie = buildMovieItem()
    expect(snapshotItemSchema.parse(movie).arr).not.toHaveProperty("fileCount")
    const show = buildShowItem()
    expect(snapshotItemSchema.parse(show).arr?.fileCount).toBe(4)
    expect(snapshotItemSchema.safeParse({ ...show, arr: { ...show.arr, fileCount: -1 } }).success).toBe(false)
  })

  it("holds labels, and the new match causes", () => {
    expect(snapshotItemSchema.parse(buildMovieItem({ labels: ["untranscodable"] })).labels).toEqual(["untranscodable"])
    expect(snapshotItemSchema.safeParse({ ...buildMovieItem(), labels: undefined }).success).toBe(false)
    expect(matchCauseSchema.options).toEqual(expect.arrayContaining(["seasonMismatch", "noArrFile"]))
    const mismatch = buildSeasonItem(buildShowItem(), 1, { match: { state: "notManaged", cause: "seasonMismatch" } })
    expect(snapshotItemSchema.safeParse(mismatch).success).toBe(true)
  })

  it("allows null facts of failed sources", () => {
    expect(snapshotItemSchema.safeParse(buildMovieItem({ plays: null, requests: null, arr: null, sizeBytes: null })).success).toBe(true)
  })
})

describe("parseSnapshotItems", () => {
  it("keeps good rows, drops bad rows with no throw, and counts them", () => {
    const good = buildMovieItem()
    const result = parseSnapshotItems([good, { ...good, copies: [] }, "not an item", null, buildShowItem()])
    expect(result.items).toEqual([good, buildShowItem()])
    expect(result).toMatchObject({ dropped: 3, total: 5 })
  })

  it("logs issue paths only, never the values of the dropped rows", () => {
    const viewer = { user: "4242", lastCountedAt: 1, lastCountedFinished: true, counted: -1, finished: true, finishedEpisodes: 0 }
    const bad = { ...buildMovieItem({ title: "A Secret Title" }), plays: { lastCountedAt: 1, countedAt: [1], viewers: [viewer] } }
    parseSnapshotItems([bad])
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "snapshotItems", dropped: 1, paths: ["plays.viewers.0.counted"] })
    const logged = JSON.stringify(mockWarn.mock.calls)
    expect(logged).not.toContain("A Secret Title")
    expect(logged).not.toContain("4242")
  })

  it.each([[undefined], [null]])("gives no rows for %j", (raw) => {
    expect(parseSnapshotItems(raw)).toEqual({ items: [], dropped: 0, total: 0 })
    expect(mockWarn).not.toHaveBeenCalled()
  })

  it("drops a value that is not an array as one row", () => {
    expect(parseSnapshotItems({ key: "x" })).toEqual({ items: [], dropped: 1, total: 1 })
  })

  it("logs each issue path once", () => {
    const rows = Array.from({ length: 30 }, (_, i) => ({ ...buildMovieItem(), [`extra${i}`]: 1, year: "x", title: i }))
    parseStoredRows("test", snapshotItemSchema, rows)
    expect(mockWarn.mock.calls[0][1]).toEqual({ document: "test", dropped: 30, paths: ["title", "year"] })
  })
})

describe("snapshotFactsSchema", () => {
  it("parses the builder output, with rowBaseline and labelsRead", () => {
    const facts = buildSnapshotFacts()
    expect(snapshotFactsSchema.parse(facts)).toEqual(facts)
    expect(parseSnapshotFacts(facts)?.rowBaseline).toEqual({ overseerrRequests: 300, tautulliRows: 5000, usersWithPlay: 12 })
    expect(parseSnapshotFacts(facts)?.history.usersWithPlay).toBe(12)
  })

  it("defaults rowBaseline for a stored snapshot without it", () => {
    const { rowBaseline: _drop, ...older } = buildSnapshotFacts()
    void _drop
    expect(parseSnapshotFacts(older)?.rowBaseline).toEqual({})
  })

  it("gives null with no throw, and logs paths only, for bad facts", () => {
    expect(parseSnapshotFacts({ ...buildSnapshotFacts(), users: { abc: { hasAccess: true, lastPlayAt: null, owner: false } } })).toBeNull()
    expect(mockWarn).toHaveBeenCalledWith("cleanup.parse_dropped", { document: "snapshotFacts", dropped: 1, paths: ["users.abc"] })
    expect(parseSnapshotFacts("x")).toBeNull()
    expect(parseSnapshotFacts(undefined)).toBeNull()
  })
})

describe("source statuses", () => {
  it("parse the builder output and the optional parts", () => {
    const sources = buildSourceStatuses({ plex: { part: "shares", state: "failed", errorCode: "NO_OWNER" }, overseerr: { state: "notConfigured", readAt: null } })
    expect(parseSourceStatuses(sources)).toEqual(sources)
    expect(sourceStatusSchema.safeParse({ ...sources[0], state: "stale" }).success).toBe(false)
  })

  it("drop a bad row", () => {
    const sources = buildSourceStatuses()
    expect(parseSourceStatuses([...sources, { service: "jellyfin", state: "ok", readAt: null }])).toEqual(sources)
    expect(parseSourceStatuses("bad")).toEqual([])
  })
})

describe("issuePaths", () => {
  it("joins paths and names the root", () => {
    const failed = sourceStatusSchema.safeParse(1)
    expect(failed.success ? [] : issuePaths(failed.error)).toEqual(["(root)"])
    expect(failed.success ? [] : issuePaths(failed.error, ["sources", 2])).toEqual(["sources.2"])
  })
})
