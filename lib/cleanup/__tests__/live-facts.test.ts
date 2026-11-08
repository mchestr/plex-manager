/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
jest.mock("@/lib/wrapped/season", () => ({ getSeasonState: jest.fn() }))
// A stored Rewind here is `{ "keys": [...] }`: the parsing of real Rewinds is poster-keys' own test
jest.mock("@/lib/wrapped/poster-keys", () => ({ extractPosterKeys: (data: string) => (JSON.parse(data) as { keys: string[] }).keys }))

import { mockReset } from "jest-mock-extended"

import { buildCleanupSnapshot } from "@/__tests__/helpers/cleanup-factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildSnapshotFacts } from "@/lib/cleanup/__tests__/helpers/builders"
import { loadLiveFacts, resetRewindKeysCache, REWIND_KEYS_TTL_MS, type SnapshotUsers } from "@/lib/cleanup/live-facts"
import { getSeasonState } from "@/lib/wrapped/season"

const now = new Date("2026-12-10T12:00:00.000Z")
const OPEN_SEASON = {
  seasonYear: 2026,
  isOpen: true,
  opensAt: new Date("2026-12-01T00:00:00.000Z"),
  closesAt: new Date("2027-02-01T00:00:00.000Z"),
}

type WatchRow = { tmdbId: number | null; tvdbId: number | null; imdbId: string | null; user: { plexUserId: string | null } }
const watchRow = (plexUserId: string | null, ids: Partial<Omit<WatchRow, "user">>): WatchRow => ({
  tmdbId: null,
  tvdbId: null,
  imdbId: null,
  ...ids,
  user: { plexUserId },
})

const USERS: SnapshotUsers = {
  "100": { hasAccess: true, lastPlayAt: null, owner: false },
  "200": { hasAccess: false, lastPlayAt: null, owner: false },
  "300": { hasAccess: null, lastPlayAt: null, owner: false },
}

beforeEach(() => {
  mockReset(prismaMock)
  resetRewindKeysCache()
  jest.mocked(getSeasonState).mockResolvedValue(OPEN_SEASON)
  prismaMock.cleanupProtection.findMany.mockResolvedValue([])
  prismaMock.userMediaMark.findMany.mockResolvedValue([])
  prismaMock.watchlistSyncHistory.findMany.mockResolvedValue([])
  prismaMock.plexWrapped.findMany.mockResolvedValue([])
  prismaMock.user.findMany.mockResolvedValue([])
})

describe("loadLiveFacts", () => {
  it("reads the active Keeps and exclusions that have not ended at now", async () => {
    const keepEnd = new Date("2027-01-01T00:00:00.000Z")
    prismaMock.cleanupProtection.findMany.mockImplementation(((args: { where: { kind: string } }) =>
      Promise.resolve(
        args.where.kind === "memberKeep"
          ? [
              { id: "k1", itemKey: "movie:tmdb:1", memberId: "user-1", expiresAt: keepEnd },
              { id: "k2", itemKey: "movie:tmdb:2", memberId: null, expiresAt: keepEnd },
              { id: "k3", itemKey: "movie:tmdb:3", memberId: "user-2", expiresAt: null },
            ]
          : [{ id: "x1", itemKey: "show:tvdb:9", expiresAt: null, createdBy: "admin-1" }]
      )) as never)

    const facts = await loadLiveFacts(now, USERS)

    expect(prismaMock.cleanupProtection.findMany).toHaveBeenCalledWith({
      where: { kind: "memberKeep", status: "active", expiresAt: { gt: now } },
      select: { id: true, itemKey: true, memberId: true, expiresAt: true },
    })
    expect(prismaMock.cleanupProtection.findMany).toHaveBeenCalledWith({
      where: { kind: "adminExclude", status: "active", OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      select: { id: true, itemKey: true, expiresAt: true, createdBy: true },
    })
    // A row with no member or no end is not a Keep
    expect(facts.keeps).toEqual([{ id: "k1", itemKey: "movie:tmdb:1", memberId: "user-1", expiresAt: keepEnd }])
    expect(facts.excludes).toEqual([{ id: "x1", itemKey: "show:tvdb:9", expiresAt: null, createdBy: "admin-1" }])
  })

  it("reads the Keep forever marks and the members", async () => {
    prismaMock.userMediaMark.findMany.mockResolvedValue([{ plexRatingKey: "5001" }, { plexRatingKey: "6101" }] as never)
    const ended = new Date("2026-10-01T00:00:00.000Z")
    prismaMock.user.findMany.mockResolvedValue([
      { id: "user-1", plexUserId: "100", name: "Member One", accessEndedAt: null },
      { id: "user-2", plexUserId: null, name: null, accessEndedAt: ended },
    ] as never)

    const facts = await loadLiveFacts(now, USERS)

    expect(prismaMock.userMediaMark.findMany).toHaveBeenCalledWith({ where: { markType: "KEEP_FOREVER" }, select: { plexRatingKey: true } })
    expect([...facts.keepForever]).toEqual(["5001", "6101"])
    expect(prismaMock.user.findMany).toHaveBeenCalledWith({ select: { id: true, plexUserId: true, name: true, accessEndedAt: true } })
    expect(facts.members).toEqual([
      { userId: "user-1", plexUserId: "100", name: "Member One", accessEndedAt: null },
      { userId: "user-2", plexUserId: null, name: null, accessEndedAt: ended },
    ])
  })

  it("keeps only the watchlists of members who sync it and have access in the snapshot", async () => {
    prismaMock.watchlistSyncHistory.findMany.mockResolvedValue([
      watchRow("100", { tmdbId: 1, imdbId: "tt01" }),
      watchRow("100", { tvdbId: 9 }),
      watchRow("200", { tmdbId: 2 }),
      watchRow("300", { tmdbId: 3 }),
      watchRow("400", { tmdbId: 4 }),
      watchRow("constructor", { tmdbId: 5 }),
      watchRow(null, { tmdbId: 6 }),
    ] as never)

    const { watchlist } = await loadLiveFacts(now, USERS)

    expect(prismaMock.watchlistSyncHistory.findMany).toHaveBeenCalledWith({
      where: { status: { not: "REMOVED_FROM_WATCHLIST" }, user: { watchlistSyncSettings: { is: { syncEnabled: true } } } },
      select: { tmdbId: true, tvdbId: true, imdbId: true, user: { select: { plexUserId: true } } },
    })
    expect(watchlist).toEqual({ tmdb: new Set([1]), tvdb: new Set([9]), imdb: new Set(["tt01"]) })
    expect(prismaMock.cleanupSnapshot.findFirst).not.toHaveBeenCalled()
  })

  it("checks access against the newest complete snapshot when no users are given", async () => {
    prismaMock.watchlistSyncHistory.findMany.mockResolvedValue([watchRow("100", { tmdbId: 1 }), watchRow("200", { tmdbId: 2 })] as never)
    const facts = buildSnapshotFacts({ users: { "200": { hasAccess: true, lastPlayAt: null, owner: false } } })
    prismaMock.cleanupSnapshot.findFirst.mockResolvedValue(buildCleanupSnapshot({ facts }))

    const { watchlist } = await loadLiveFacts(now)

    expect(prismaMock.cleanupSnapshot.findFirst).toHaveBeenCalledWith({
      where: { status: "complete" },
      orderBy: { finishedAt: "desc" },
      select: { facts: true },
    })
    expect([...watchlist.tmdb]).toEqual([2])
  })

  it.each([
    ["no snapshot", null],
    ["a snapshot whose facts do not parse", buildCleanupSnapshot({ facts: { version: 9 } })],
  ])("gives no watchlist with %s", async (_name, snapshot) => {
    prismaMock.watchlistSyncHistory.findMany.mockResolvedValue([watchRow("100", { tmdbId: 1 })] as never)
    prismaMock.cleanupSnapshot.findFirst.mockResolvedValue(snapshot)

    const { watchlist } = await loadLiveFacts(now)

    expect(watchlist.tmdb.size).toBe(0)
  })

  it("collects the poster keys of the completed Rewinds of the season year", async () => {
    prismaMock.plexWrapped.findMany.mockResolvedValue([{ data: JSON.stringify({ keys: ["5001", "6001"] }) }, { data: JSON.stringify({ keys: ["6001"] }) }] as never)

    const { rewindKeys } = await loadLiveFacts(now, USERS)

    expect(getSeasonState).toHaveBeenCalledWith(now)
    expect(prismaMock.plexWrapped.findMany).toHaveBeenCalledWith({ where: { year: 2026, status: "completed" }, select: { data: true } })
    expect(rewindKeys).toEqual(new Set(["5001", "6001"]))
  })

  it("caches the Rewind keys for 10 minutes for each season year", async () => {
    jest.useFakeTimers({ now })
    try {
      prismaMock.plexWrapped.findMany.mockResolvedValue([{ data: JSON.stringify({ keys: ["5001"] }) }] as never)
      await loadLiveFacts(now, USERS)
      await loadLiveFacts(now, USERS)
      expect(prismaMock.plexWrapped.findMany).toHaveBeenCalledTimes(1)

      jest.mocked(getSeasonState).mockResolvedValueOnce({ ...OPEN_SEASON, seasonYear: 2027, closesAt: new Date("2028-02-01T00:00:00.000Z") })
      await loadLiveFacts(now, USERS)
      expect(prismaMock.plexWrapped.findMany).toHaveBeenLastCalledWith({ where: { year: 2027, status: "completed" }, select: { data: true } })
      expect(prismaMock.plexWrapped.findMany).toHaveBeenCalledTimes(2)

      jest.advanceTimersByTime(REWIND_KEYS_TTL_MS)
      await loadLiveFacts(now, USERS)
      expect(prismaMock.plexWrapped.findMany).toHaveBeenCalledTimes(3)
      expect(REWIND_KEYS_TTL_MS).toBe(10 * 60_000)
    } finally {
      jest.useRealTimers()
    }
  })

  it("gives no Rewind keys once the season has closed", async () => {
    jest.mocked(getSeasonState).mockResolvedValue({ ...OPEN_SEASON, isOpen: false, closesAt: now })

    const { rewindKeys } = await loadLiveFacts(now, USERS)

    expect(rewindKeys).toBeNull()
    expect(prismaMock.plexWrapped.findMany).not.toHaveBeenCalled()
  })

  it("reads at the current time by default", async () => {
    const before = Date.now()
    await loadLiveFacts(undefined, USERS)

    const [at] = jest.mocked(getSeasonState).mock.calls[0]
    expect(at!.getTime()).toBeGreaterThanOrEqual(before)
  })
})
