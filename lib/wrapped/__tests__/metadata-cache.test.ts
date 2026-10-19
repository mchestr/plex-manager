/**
 * @jest-environment node
 */

/**
 * Tests for the metadata cache and its warm (P2.6, design 7.5).
 */

import { tautulliCommand } from "@/lib/connections/tautulli"
import { prisma } from "@/lib/prisma"
import { enqueueMetadataWarm } from "@/lib/queue/rewind-batch-queue"
import { getMetadata, NEVER_WARMED, upsertLibraryItems } from "@/lib/wrapped/metadata-cache"
import { WARM_CONCURRENCY, warmTitles } from "@/lib/wrapped/metadata-warm"
import { directLimiter, type UpstreamLimiter } from "@/lib/wrapped/sources/watch-history-source"

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    mediaMetadataCache: { findMany: jest.fn(), upsert: jest.fn(async () => ({})) },
  },
}))
jest.mock("@/lib/connections/tautulli", () => ({ tautulliCommand: jest.fn() }))
jest.mock("@/lib/queue/rewind-batch-queue", () => ({ enqueueMetadataWarm: jest.fn(async () => ({})) }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const NOW = Date.parse("2026-11-20T12:00:00Z")
const DAY = 24 * 60 * 60 * 1000
const findMany = prisma.mediaMetadataCache.findMany as unknown as jest.Mock
const upsert = prisma.mediaMetadataCache.upsert as unknown as jest.Mock

const row = (ratingKey: string, fetchedAt: Date) => ({ ratingKey, kind: "series", genres: ["Drama"], fetchedAt })
const film = { ratingKey: "900", grandparentRatingKey: null }
const episode = { ratingKey: "501", grandparentRatingKey: "500" }

const metadata = (ratingKey: string) => ({
  rating_key: ratingKey,
  media_type: "movie",
  title: "A Film",
  year: 2026,
  content_rating: "PG-13",
  section_id: "1",
  added_at: 1767225600,
  originally_available_at: "2026-01-02",
  genres: ["Drama"],
  directors: ["A Director"],
  actors: ["An Actor"],
  studio: "A Studio",
  guids: ["tmdb://1", "imdb://tt1"],
  duration: 7_200_000,
  media_info: [{ video_full_resolution: "4k", video_dynamic_range: "HDR" }],
})

beforeEach(() => {
  findMany.mockReset()
  upsert.mockClear()
  jest.mocked(enqueueMetadataWarm).mockClear()
  jest.mocked(tautulliCommand).mockReset()
})

describe("getMetadata", () => {
  it("reads every title with one findMany, and leaves a miss absent", async () => {
    findMany.mockResolvedValue([row("900", new Date(NOW - DAY))])

    const result = await getMetadata([film, { ratingKey: "404", grandparentRatingKey: null }], { now: NOW })

    expect(findMany).toHaveBeenCalledTimes(1)
    expect(result.get("900")?.genres).toEqual(["Drama"])
    expect(result.has("404")).toBe(false)
  })

  it("resolves an episode to its series", async () => {
    findMany.mockResolvedValue([row("500", new Date(NOW - DAY))])

    const result = await getMetadata([episode], { now: NOW })

    expect(findMany.mock.calls[0][0].where.ratingKey.in).toEqual(["500"])
    expect(result.get("501")?.ratingKey).toBe("500")
  })

  it("serves a row older than 30 days and queues its refresh", async () => {
    findMany.mockResolvedValue([row("900", new Date(NOW - 31 * DAY))])

    const result = await getMetadata([film], { now: NOW })

    expect(result.get("900")).toBeDefined()
    expect(enqueueMetadataWarm).toHaveBeenCalledWith(expect.objectContaining({ keys: ["900"], topSeries: [] }))
  })

  it("queues no refresh for fresh rows or rows only the library pass wrote", async () => {
    findMany.mockResolvedValue([row("900", new Date(NOW - DAY)), row("500", NEVER_WARMED)])

    await getMetadata([film, episode], { now: NOW })

    expect(enqueueMetadataWarm).not.toHaveBeenCalled()
  })
})

describe("upsertLibraryItems", () => {
  it("writes films and series, dated never-warmed, and leaves warm fields alone on update", async () => {
    const item = { ratingKey: "900", type: "movie", title: "A Film", year: 2026, addedAt: NOW, contentRating: "X", librarySectionId: "1", genres: [], directors: [], actors: [], guids: [] }

    await upsertLibraryItems([item, { ...item, ratingKey: "1", type: "artist" }])

    expect(upsert).toHaveBeenCalledTimes(1)
    const [{ create, update }] = upsert.mock.calls[0]
    expect(create).toMatchObject({ ratingKey: "900", kind: "film", contentRating: "X", fetchedAt: NEVER_WARMED })
    expect(update).not.toHaveProperty("fetchedAt")
    expect(update).not.toHaveProperty("runtimeSec")
  })
})

describe("warmTitles", () => {
  const config = { url: "http://tautulli.local:8181", apiKey: "key" }

  it("stores get_metadata's runtime, rating, resolution, HDR and guids", async () => {
    jest.mocked(tautulliCommand).mockResolvedValue({ ok: true, data: metadata("900") })

    const result = await warmTitles({ keys: ["900"], topSeries: [] }, { config, limiter: directLimiter })

    expect(result).toEqual({ fetched: 1, failedCalls: 0 })
    expect(jest.mocked(tautulliCommand).mock.calls[0].slice(1, 3)).toEqual(["get_metadata", { rating_key: "900" }])
    expect(jest.mocked(tautulliCommand).mock.calls[0][4]).toMatchObject({ timeoutMs: 10_000, attempts: 1 })
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      runtimeSec: 7200,
      contentRating: "PG-13",
      videoResolution: "4k",
      hdr: true,
      guids: ["tmdb://1", "imdb://tt1"],
    })
  })

  it("drops a title whose call times out and keeps the rest", async () => {
    jest.mocked(tautulliCommand).mockImplementation(async (_config, _cmd, params) =>
      params.rating_key === "902" ? { ok: false, code: "TIMEOUT" } : { ok: true, data: metadata(String(params.rating_key)) }
    )

    const result = await warmTitles({ keys: ["901", "902", "903"], topSeries: [] }, { config, limiter: directLimiter })

    expect(result).toEqual({ fetched: 2, failedCalls: 1 })
    expect(upsert.mock.calls.map(([args]) => args.where.ratingKey)).toEqual(expect.arrayContaining(["901", "903"]))
    expect(upsert).toHaveBeenCalledTimes(2)
  })

  it("never runs more than 4 calls at once, and each goes through the limiter", async () => {
    let inFlight = 0
    let peak = 0
    jest.mocked(tautulliCommand).mockImplementation(async (_config, _cmd, params) => {
      inFlight++
      peak = Math.max(peak, inFlight)
      await new Promise((resolve) => setTimeout(resolve, 5))
      inFlight--
      return { ok: true, data: metadata(String(params.rating_key)) }
    })
    const limiter: UpstreamLimiter = { run: jest.fn((_service, fn) => fn()) }
    const keys = Array.from({ length: 20 }, (_, i) => String(1000 + i))

    const result = await warmTitles({ keys, topSeries: [] }, { config, limiter })

    expect(result.fetched).toBe(20)
    expect(peak).toBe(WARM_CONCURRENCY)
    expect(WARM_CONCURRENCY).toBe(4)
    expect(limiter.run).toHaveBeenCalledTimes(20)
  })

  it("adds season episode counts for a top series", async () => {
    jest.mocked(tautulliCommand).mockImplementation(async (_config, cmd, params) => {
      if (cmd === "get_metadata") return { ok: true, data: { ...metadata("500"), media_type: "show", media_info: [] } }
      if (params.media_type === "show") {
        return { ok: true, data: { children_count: 2, children_list: [{ rating_key: "510", media_index: 1 }, { rating_key: "520", media_index: 2 }] } }
      }
      return { ok: true, data: { children_count: params.rating_key === "510" ? 9 : 8, children_list: [] } }
    })

    await warmTitles({ keys: ["500"], topSeries: ["500"] }, { config, limiter: directLimiter })

    expect(upsert.mock.calls[0][0].create).toMatchObject({ kind: "series", seasonEpisodeCounts: { "1": 9, "2": 8 }, hdr: null })
  })
})
