/**
 * @jest-environment node
 */

const mockError = jest.fn()
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: (...args: unknown[]) => mockError(...args), warn: jest.fn() }),
}))

import { mockReset } from "jest-mock-extended"

import { buildCleanupSnapshot, buildCleanupSnapshotPart } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildMovieItem, buildSeasonItem, buildShowItem, buildSnapshotFacts } from "@/lib/cleanup/__tests__/helpers/builders"
import { CACHED_SNAPSHOTS, loadNewestSnapshot, loadSnapshotLevel, MAX_INVALID_SHARE, resetSnapshotCache } from "@/lib/cleanup/snapshot/cache"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { CleanupSnapshotPart } from "@/lib/generated/prisma/client"

const facts = buildSnapshotFacts()
const movie = buildMovieItem()
const show = buildShowItem()
const seasons = [buildSeasonItem(show, 1), buildSeasonItem(show, 2)]
const ITEMS: Record<string, SnapshotItem[]> = { movie: [movie], show: [show], season: seasons }

/** The newest complete header is `id`. */
function newest(id: string) {
  prismaMock.cleanupSnapshot.findFirst.mockResolvedValue(buildCleanupSnapshot({ id, facts }))
}

/** Parts answer with `items` by level, or no row for a level left out. */
function partsAre(items: Record<string, unknown[] | undefined> = ITEMS) {
  prismaMock.cleanupSnapshotPart.findUnique.mockImplementation(((args: { where: { snapshotId_level: { snapshotId: string; level: string } } }) => {
    const { snapshotId, level } = args.where.snapshotId_level
    const list = items[level]
    return Promise.resolve(list ? buildCleanupSnapshotPart({ snapshotId, level, items: list as CleanupSnapshotPart["items"] }) : null)
  }) as never)
}

const partReads = () => prismaMock.cleanupSnapshotPart.findUnique.mock.calls.map(([args]) => args.where.snapshotId_level)

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  resetSnapshotCache()
  partsAre()
})

describe("loadNewestSnapshot", () => {
  it("is null without a complete snapshot", async () => {
    prismaMock.cleanupSnapshot.findFirst.mockResolvedValue(null)

    await expect(loadNewestSnapshot()).resolves.toBeNull()
    expect(prismaMock.cleanupSnapshot.findFirst).toHaveBeenCalledWith({ where: { status: "complete" }, orderBy: { finishedAt: "desc" } })
    expect(prismaMock.cleanupSnapshotPart.findUnique).not.toHaveBeenCalled()
  })

  it("reads the newest complete header, then its three parts, with their indexes", async () => {
    newest("snap-1")

    const loaded = await loadNewestSnapshot()

    expect(loaded?.header).toMatchObject({ id: "snap-1", status: "complete", facts })
    expect(partReads()).toEqual([
      { snapshotId: "snap-1", level: "movie" },
      { snapshotId: "snap-1", level: "show" },
      { snapshotId: "snap-1", level: "season" },
    ])
    expect(loaded?.levels.movie).toMatchObject({ level: "movie", items: [movie] })
    expect(loaded?.levels.movie?.byKey.get(movie.key)).toEqual(movie)
    expect(loaded?.levels.show?.byTitleKey.get(show.titleKey)).toEqual([show])
    // Seasons share their show's title key
    expect(loaded?.levels.season?.byTitleKey.get(show.titleKey)).toEqual(seasons)
    expect(loaded?.levels.season?.byKey.get(seasons[1].key)).toEqual(seasons[1])
  })

  it("reads the header on every call and the parts once for each snapshot", async () => {
    newest("snap-1")
    const first = await loadNewestSnapshot()
    const again = await loadNewestSnapshot()

    expect(prismaMock.cleanupSnapshot.findFirst).toHaveBeenCalledTimes(2)
    expect(prismaMock.cleanupSnapshotPart.findUnique).toHaveBeenCalledTimes(3)
    expect(again?.levels.season).toBe(first?.levels.season)

    newest("snap-2")
    const next = await loadNewestSnapshot()
    expect(next?.header.id).toBe("snap-2")
    expect(prismaMock.cleanupSnapshotPart.findUnique).toHaveBeenCalledTimes(6)
  })

  it("keeps at most 2 snapshots: the oldest one read leaves the cache", async () => {
    for (const id of ["snap-1", "snap-2", "snap-3"]) {
      newest(id)
      await loadNewestSnapshot()
    }
    expect(prismaMock.cleanupSnapshotPart.findUnique).toHaveBeenCalledTimes(9)

    newest("snap-2")
    await loadNewestSnapshot()
    expect(prismaMock.cleanupSnapshotPart.findUnique).toHaveBeenCalledTimes(9)

    newest("snap-1")
    await loadNewestSnapshot()
    expect(prismaMock.cleanupSnapshotPart.findUnique).toHaveBeenCalledTimes(12)
    expect(CACHED_SNAPSHOTS).toBe(2)
  })

  it("is null when the facts of the newest snapshot do not parse, and caches nothing", async () => {
    prismaMock.cleanupSnapshot.findFirst.mockResolvedValue(buildCleanupSnapshot({ id: "snap-bad", facts: { version: 2 } }))

    await expect(loadNewestSnapshot()).resolves.toBeNull()
    await expect(loadNewestSnapshot()).resolves.toBeNull()
    expect(mockError).toHaveBeenCalledWith("cleanup.snapshot_facts_invalid", undefined, { snapshotId: "snap-bad" })
    expect(prismaMock.cleanupSnapshotPart.findUnique).not.toHaveBeenCalled()
  })

  it("gives no data for a level whose part is missing", async () => {
    newest("snap-1")
    partsAre({ movie: [movie], show: [show] })

    const loaded = await loadNewestSnapshot()

    expect(loaded?.levels.season).toBeNull()
    expect(loaded?.levels.movie?.items).toEqual([movie])
    expect(mockError).toHaveBeenCalledWith("cleanup.snapshot_part_missing", undefined, { snapshotId: "snap-1", level: "season" })
  })
})

describe("the 1 % rule", () => {
  const movies = (count: number) => Array.from({ length: count }, (_, n) => buildMovieItem({ key: `movie:tmdb:${n + 1}`, titleKey: `tmdb:${n + 1}` }))

  it("drops up to 1 % of bad rows one by one", async () => {
    newest("snap-1")
    partsAre({ ...ITEMS, movie: [...movies(99), { key: "broken" }] })

    const loaded = await loadSnapshotLevel("movie")

    expect(loaded?.items).toHaveLength(99)
    expect(loaded?.byKey.has("broken")).toBe(false)
    expect(MAX_INVALID_SHARE).toBe(0.01)
  })

  it("treats a part with more than 1 % of bad rows as failed", async () => {
    newest("snap-1")
    partsAre({ ...ITEMS, movie: [...movies(98), { key: "broken" }, { key: "also broken" }] })

    await expect(loadSnapshotLevel("movie")).resolves.toBeNull()
    expect(mockError).toHaveBeenCalledWith("cleanup.snapshot_rows_invalid", undefined, { snapshotId: "snap-1", level: "movie", dropped: 2, total: 100 })
  })

  it("keeps an empty part", async () => {
    newest("snap-1")
    partsAre({ ...ITEMS, season: [] })

    await expect(loadSnapshotLevel("season")).resolves.toMatchObject({ level: "season", items: [] })
  })
})

describe("loadSnapshotLevel", () => {
  it("reads one level of the newest snapshot with its header", async () => {
    newest("snap-1")

    const loaded = await loadSnapshotLevel("show")

    expect(loaded).toMatchObject({ level: "show", items: [show], header: { id: "snap-1", facts } })
    expect(loaded?.byKey.get(show.key)).toEqual(show)
    expect(partReads()).toEqual([{ snapshotId: "snap-1", level: "show" }])
  })

  it("is null without a complete snapshot", async () => {
    prismaMock.cleanupSnapshot.findFirst.mockResolvedValue(null)
    await expect(loadSnapshotLevel("movie")).resolves.toBeNull()
  })

  it("shares one read between callers at the same time, and with a later full load", async () => {
    newest("snap-1")

    await Promise.all([loadSnapshotLevel("movie"), loadSnapshotLevel("movie")])
    await loadNewestSnapshot()

    expect(partReads()).toEqual([
      { snapshotId: "snap-1", level: "movie" },
      { snapshotId: "snap-1", level: "show" },
      { snapshotId: "snap-1", level: "season" },
    ])
  })

  it("does not keep a read that failed, so the next call reads again", async () => {
    newest("snap-1")
    const thrown = new Error("database down")
    prismaMock.cleanupSnapshotPart.findUnique.mockRejectedValueOnce(thrown)

    await expect(loadSnapshotLevel("movie")).rejects.toBe(thrown)
    partsAre()
    await expect(loadSnapshotLevel("movie")).resolves.toMatchObject({ items: [movie] })
    expect(prismaMock.cleanupSnapshotPart.findUnique).toHaveBeenCalledTimes(2)
  })
})
