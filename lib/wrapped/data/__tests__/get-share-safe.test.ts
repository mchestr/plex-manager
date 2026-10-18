/**
 * @jest-environment node
 */

/**
 * getShareSafeRewind reads a shared Rewind straight from the database and
 * returns only the share-safe projection, keeping the row id on the server
 * (P0.11: RWP-09, SEC-26, BP-23).
 */

import { prisma } from "@/lib/prisma"
import { getShareSafeRewind } from "@/lib/wrapped/data/get-share-safe"

jest.mock("@/lib/prisma", () => ({
  prisma: {
    plexWrapped: { findUnique: jest.fn() },
  },
}))

/**
 * A request-scoped memo standing in for React's server `cache()`, which the
 * non-server React build Jest loads replaces with a pass-through.
 */
jest.mock("react", () => {
  const actual = jest.requireActual<typeof import("react")>("react")
  return {
    ...actual,
    cache: <A extends unknown[], R>(fn: (...args: A) => R) => {
      const memo = new Map<string, R>()
      return (...args: A): R => {
        const key = JSON.stringify(args)
        if (!memo.has(key)) memo.set(key, fn(...args))
        return memo.get(key) as R
      }
    },
  }
})

const mockFindUnique = prisma.plexWrapped.findUnique as jest.Mock

/** Each test uses its own tokens, because the memo above lives for the file. */
function token(seed: string): string {
  return seed.padEnd(43, "x")
}

function storedRow(overrides: Record<string, unknown> = {}) {
  return {
    id: "wrapped-1",
    year: 2026,
    status: "completed",
    summary: "A big year.",
    archetype: "The Midnight Marathoner",
    data: JSON.stringify({
      userId: "user-1",
      userName: "owner@example.com",
      statistics: {
        totalWatchTime: { total: 6000 },
        moviesWatched: 12,
        showsWatched: 4,
        episodesWatched: 40,
        topMovies: [{ title: "Dune: Part Three", watchTime: 165, playCount: 1, ratingKey: "101" }],
        topShows: [],
        watchTimeByMonth: [{ month: 3, watchTime: 600 }],
        leaderboards: { watchTime: { leaderboard: [{ username: "jsnow", totalWatchTime: 9000 }] } },
      },
    }),
    user: { name: "Mike" },
    ...overrides,
  }
}

describe("getShareSafeRewind", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it.each([
    ["too short", "abc"],
    ["one character too long", "a".repeat(44)],
    ["not base64url", `${"a".repeat(42)}=`],
    ["a path", `../${"a".repeat(40)}`],
    ["empty", ""],
  ])("returns null for a malformed token (%s) without a database call", async (_label, malformed) => {
    await expect(getShareSafeRewind(malformed)).resolves.toBeNull()
    expect(mockFindUnique).not.toHaveBeenCalled()
  })

  it.each([
    ["an unknown token", "unknown", null],
    ["a revoked token, whose row no longer holds it", "revoked", null],
    ["a generating row", "generating", storedRow({ status: "generating" })],
    ["a failed row", "failed", storedRow({ status: "failed" })],
  ])("returns null for %s", async (_label, seed, row) => {
    mockFindUnique.mockResolvedValue(row)

    await expect(getShareSafeRewind(token(seed))).resolves.toBeNull()
    expect(mockFindUnique).toHaveBeenCalledTimes(1)
  })

  it("returns the projection and the row id for a valid token", async () => {
    mockFindUnique.mockResolvedValue(storedRow())
    const valid = token("valid_-09AZ")

    const found = await getShareSafeRewind(valid)

    expect(found).toEqual({
      wrappedId: "wrapped-1",
      share: {
        year: 2026,
        ownerName: "Mike",
        summary: "A big year.",
        archetypeName: "The Midnight Marathoner",
        totals: { minutes: 6000, movies: 12, shows: 4, episodes: 40 },
        months: [{ month: 3, minutes: 600 }],
        topMovies: [{ title: "Dune: Part Three", minutes: 165, plays: 1, ratingKey: "101" }],
        topShows: [],
      },
    })
    expect(JSON.stringify(found?.share)).not.toMatch(/jsnow|leaderboard|user-1|owner@example\.com|wrapped-1/)
    expect(mockFindUnique).toHaveBeenCalledWith({
      where: { shareToken: valid },
      select: {
        id: true,
        year: true,
        status: true,
        summary: true,
        archetype: true,
        data: true,
        user: { select: { name: true } },
      },
    })
  })

  it("is wrapped in cache(), so the metadata and the page share one lookup", async () => {
    mockFindUnique.mockResolvedValue(storedRow())
    const shared = token("cached")

    const [metadataLookup, pageLookup] = [await getShareSafeRewind(shared), await getShareSafeRewind(shared)]

    expect(pageLookup).toBe(metadataLookup)
    expect(mockFindUnique).toHaveBeenCalledTimes(1)
  })

  it("lets a database error through instead of reporting the share as missing", async () => {
    mockFindUnique.mockRejectedValue(new Error("connection refused"))

    await expect(getShareSafeRewind(token("db-down"))).rejects.toThrow("connection refused")
  })
})
