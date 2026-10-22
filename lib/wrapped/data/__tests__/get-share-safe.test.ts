/**
 * @jest-environment node
 */

/**
 * getShareSafeRewind reads a shared Rewind straight from the database and
 * returns only the share-safe projection, keeping the ids on the server
 * (P0.11: RWP-09, SEC-26, BP-23). P7.5: v3 links by `sha256(token)`, refused
 * when revoked, rotated or expired and while public links are off; surviving
 * v2 tokens until the 2026 season closes.
 */

import { createHash } from "node:crypto"

import { mockReset } from "jest-mock-extended"

import { buildConfig, buildPlexWrapped, buildRewindShare } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import type { RewindShare } from "@/lib/generated/prisma/client"
import { getShareSafeRewind } from "@/lib/wrapped/data/get-share-safe"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

import { fixtureRewind } from "./share-fixture"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/settings/app-settings", () => ({
  getAppSettings: jest.fn().mockResolvedValue({ serverName: "Chester Family Plex", timeZone: "UTC", locale: "en-US" }),
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

const sha256 = (value: string) => createHash("sha256").update(value).digest("hex")

/** Each test uses its own tokens, because the memo above lives for the file. */
function token(seed: string): string {
  return seed.padEnd(43, "x")
}

let heavy: RewindDataV3

beforeAll(async () => {
  heavy = await fixtureRewind("heavy")
})

function v2Row(overrides: Record<string, unknown> = {}) {
  return {
    ...buildPlexWrapped({ id: "wrapped-2", userId: "user-2", year: 2025 }),
    summary: "A big year.",
    archetype: "The Midnight Marathoner",
    data: JSON.stringify({
      userId: "user-2",
      userName: "owner@example.com",
      statistics: {
        totalWatchTime: { total: 6000 },
        moviesWatched: 12,
        showsWatched: 4,
        episodesWatched: 40,
        topMovies: [{ title: "Dune: Part Three", watchTime: 165, playCount: 1, ratingKey: "101" }],
        topShows: [],
        leaderboards: { watchTime: { leaderboard: [{ username: "jsnow", totalWatchTime: 9000 }] } },
      },
    }),
    user: { name: "Mike" },
    ...overrides,
  }
}

/** The share `findUnique` by token hash returns, with its Rewind. */
function v3Share(overrides: Partial<RewindShare> = {}, wrapped: Record<string, unknown> = {}) {
  return {
    ...buildRewindShare({ id: "share-1", assetKey: "Abcdefghijklmnopqrstuv", pages: ["top-shows"], ...overrides }),
    wrapped: { ...buildPlexWrapped({ id: "wrapped-1", userId: "user-1", data: JSON.stringify(heavy), dataVersion: 3 }), ...wrapped },
  }
}

beforeEach(() => {
  mockReset(prismaMock)
  prismaMock.config.findUnique.mockResolvedValue(buildConfig())
  prismaMock.rewindShare.findUnique.mockResolvedValue(null)
  prismaMock.plexWrapped.findUnique.mockResolvedValue(null)
  prismaMock.rewindPrefs.findUnique.mockResolvedValue(null)
  prismaMock.rewindExclusion.findMany.mockResolvedValue([])
})

afterEach(() => {
  jest.useRealTimers()
})

describe("getShareSafeRewind", () => {
  it.each([
    ["too short", "abc"],
    ["one character too long", "a".repeat(44)],
    ["not base64url", `${"a".repeat(42)}=`],
    ["a path", `../${"a".repeat(40)}`],
    ["empty", ""],
  ])("returns null for a malformed token (%s) without a database call", async (_label, malformed) => {
    await expect(getShareSafeRewind(malformed)).resolves.toBeNull()
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
    expect(prismaMock.rewindShare.findUnique).not.toHaveBeenCalled()
  })

  describe("a v3 link", () => {
    it("is found by the SHA-256 of its token and projected, keeping the ids beside the projection", async () => {
      const valid = token("v3-valid")
      prismaMock.rewindShare.findUnique.mockResolvedValue(v3Share())

      const found = await getShareSafeRewind(valid)

      expect(prismaMock.rewindShare.findUnique).toHaveBeenCalledWith(expect.objectContaining({ where: { tokenHash: sha256(valid) } }))
      expect(found).toMatchObject({ kind: "v3", shareId: "share-1", wrappedId: "wrapped-1", ownerUserId: "user-1", assetKey: "Abcdefghijklmnopqrstuv", year: 2026 })
      if (found?.kind !== "v3") throw new Error("expected a v3 share")
      expect(found.share.pages.map((page) => page.type)).toEqual(["top-shows"])
      expect(JSON.stringify(found.share)).not.toMatch(/user-1|wrapped-1|share-1|Abcdefghij/)
      expect(prismaMock.plexWrapped.findUnique).not.toHaveBeenCalled()
    })

    it.each([
      ["revoked", { revokedAt: new Date("2026-12-02T00:00:00Z") }, {}],
      ["rotated (its old row is revoked)", { revokedAt: new Date(), rotatedFromId: null }, {}],
      ["expired", { expiresAt: new Date(Date.now() - 1000) }, {}],
      ["on an unfinished Rewind", {}, { status: "generating" }],
    ])("is null when %s", async (label, share, wrapped) => {
      prismaMock.rewindShare.findUnique.mockResolvedValue(v3Share(share, wrapped))
      await expect(getShareSafeRewind(token(`v3-${label.slice(0, 8)}`))).resolves.toBeNull()
    })

    it("is null while public links are off, without looking the token up", async () => {
      prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindPublicLinks: false }))
      prismaMock.rewindShare.findUnique.mockResolvedValue(v3Share())

      await expect(getShareSafeRewind(token("v3-off"))).resolves.toBeNull()
      expect(prismaMock.rewindShare.findUnique).not.toHaveBeenCalled()
    })
  })

  describe("a surviving v2 token", () => {
    it("opens its completed row through the v2 projection before the season closes", async () => {
      jest.useFakeTimers({ now: new Date("2027-01-31T12:00:00Z"), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] })
      prismaMock.plexWrapped.findUnique.mockResolvedValue(v2Row())

      const found = await getShareSafeRewind(token("v2-open"))

      expect(found).toMatchObject({ kind: "v2", wrappedId: "wrapped-2", ownerUserId: "user-2", year: 2025 })
      expect(found?.share).toMatchObject({ ownerName: "Mike", totals: { minutes: 6000, movies: 12, shows: 4, episodes: 40 } })
      expect(JSON.stringify(found?.share)).not.toMatch(/jsnow|leaderboard|user-2|owner@example\.com|wrapped-2/)
    })

    it("is null after the season closes", async () => {
      jest.useFakeTimers({ now: new Date("2027-02-01T00:00:01Z"), doNotFake: ["nextTick", "setImmediate", "queueMicrotask"] })
      prismaMock.plexWrapped.findUnique.mockResolvedValue(v2Row())

      await expect(getShareSafeRewind(token("v2-closed"))).resolves.toBeNull()
    })

    it.each(["generating", "failed"])("is null for a %s row", async (status) => {
      prismaMock.plexWrapped.findUnique.mockResolvedValue(v2Row({ status }))
      await expect(getShareSafeRewind(token(`v2-${status}`))).resolves.toBeNull()
    })

    it("is null while public links are off", async () => {
      prismaMock.config.findUnique.mockResolvedValue(buildConfig({ rewindPublicLinks: false }))
      prismaMock.plexWrapped.findUnique.mockResolvedValue(v2Row())

      await expect(getShareSafeRewind(token("v2-off"))).resolves.toBeNull()
      expect(prismaMock.plexWrapped.findUnique).not.toHaveBeenCalled()
    })
  })

  it("returns null for an unknown token", async () => {
    await expect(getShareSafeRewind(token("unknown"))).resolves.toBeNull()
    expect(prismaMock.rewindShare.findUnique).toHaveBeenCalledTimes(1)
    expect(prismaMock.plexWrapped.findUnique).toHaveBeenCalledTimes(1)
  })

  it("is wrapped in cache(), so the metadata and the page share one lookup", async () => {
    prismaMock.rewindShare.findUnique.mockResolvedValue(v3Share())
    const shared = token("cached")

    const [metadataLookup, pageLookup] = [await getShareSafeRewind(shared), await getShareSafeRewind(shared)]

    expect(pageLookup).toBe(metadataLookup)
    expect(prismaMock.rewindShare.findUnique).toHaveBeenCalledTimes(1)
  })

  it("lets a database error through instead of reporting the share as missing", async () => {
    prismaMock.rewindShare.findUnique.mockRejectedValue(new Error("connection refused"))

    await expect(getShareSafeRewind(token("db-down"))).rejects.toThrow("connection refused")
  })
})
