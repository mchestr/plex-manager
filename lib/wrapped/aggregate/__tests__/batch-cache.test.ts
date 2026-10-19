/**
 * @jest-environment node
 */

/**
 * Tests for the per-batch event cache (P2.6, design 7.4).
 */

import { gunzipSync } from "node:zlib"

import { getMemberEvents, getMemberLifetimeEvents, storeMemberEvents } from "@/lib/wrapped/aggregate/batch-cache"
import { getContentRatings } from "@/lib/wrapped/metadata-cache"
import { directLimiter } from "@/lib/wrapped/sources/watch-history-source"
import { dataWindow } from "@/lib/wrapped/time/zone"

import { play } from "./build-plays"
import { fakeRedis } from "./fake-redis"

jest.mock("@/lib/queue/connection", () => ({ getRequestPathRedis: jest.fn(), readyWithin: jest.fn() }))
jest.mock("@/lib/wrapped/metadata-cache", () => ({ getContentRatings: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const zone = "America/Chicago"
const window = dataWindow(2026, zone, { finalCut: false })
const member = { userId: "user-1", plexUserId: "101" }
const batch = { year: 2026, through: "2026-11-30" }
const ctx = { limiter: directLimiter }
const events = [
  play({ at: "2026-03-01T20:00", zone, seconds: 3000, series: "500" }),
  play({ at: "2026-04-01T20:00", zone, seconds: 5400, film: "900" }),
]

function source() {
  return {
    fetchYear: jest.fn(async () => ({ ok: true as const, data: events })),
    fetchLifetime: jest.fn(async () => ({ ok: true as const, data: events })),
  }
}

beforeEach(() => {
  jest.mocked(getContentRatings).mockResolvedValue(new Map())
})

describe("the batch event cache", () => {
  it("stores a member's plays gzipped under the batch key, for 24 hours", async () => {
    const redis = fakeRedis()

    await storeMemberEvents(redis, { ...batch, userId: "user-1", window, events })

    const entry = redis.store.get("rw:batch:2026:2026-11-30:events:user-1")
    expect(entry?.ttlSeconds).toBe(86_400)
    expect(JSON.parse(gunzipSync(entry!.value).toString("utf8")).events).toHaveLength(2)
  })

  it("serves a stored entry without reading Tautulli", async () => {
    const redis = fakeRedis()
    const history = source()
    await storeMemberEvents(redis, { ...batch, userId: "user-1", window, events })

    const result = await getMemberEvents({ ...batch, member, window, source: history, excludedContentRatings: [], redis }, ctx)

    expect(result).toEqual({ ok: true, data: events.map((e) => ({ ...e, contentRating: null })) })
    expect(history.fetchYear).not.toHaveBeenCalled()
  })

  it("falls back to a per-member read when the entry is missing or for another window", async () => {
    const redis = fakeRedis()
    const history = source()

    await getMemberEvents({ ...batch, member, window, source: history, excludedContentRatings: [], redis }, ctx)
    await storeMemberEvents(redis, { ...batch, userId: "user-1", window: dataWindow(2026, "UTC", { finalCut: false }), events })
    await getMemberEvents({ ...batch, member, window, source: history, excludedContentRatings: [], redis }, ctx)

    expect(history.fetchYear).toHaveBeenCalledTimes(2)
    expect(history.fetchYear).toHaveBeenCalledWith({ plexUserId: "101" }, window, ctx)
  })

  it("falls back when Redis fails", async () => {
    const redis = fakeRedis()
    jest.mocked(redis.getBuffer).mockRejectedValueOnce(new Error("Connection is closed."))
    const history = source()

    const result = await getMemberEvents({ ...batch, member, window, source: history, excludedContentRatings: [], redis }, ctx)

    expect(result.ok).toBe(true)
    expect(history.fetchYear).toHaveBeenCalledTimes(1)
  })

  it("passes a failed per-member read on", async () => {
    const history = { fetchYear: jest.fn(async () => ({ ok: false as const, code: "TAUTULLI_ERROR" as const })) }

    const result = await getMemberEvents({ ...batch, member, window, source: history, excludedContentRatings: [], redis: fakeRedis() }, ctx)

    expect(result).toEqual({ ok: false, code: "TAUTULLI_ERROR" })
  })

  it("caches the lifetime plays the first time they are read", async () => {
    const redis = fakeRedis()
    const history = source()

    await getMemberLifetimeEvents({ ...batch, member, source: history, redis }, ctx)
    const second = await getMemberLifetimeEvents({ ...batch, member, source: history, redis }, ctx)

    expect(history.fetchLifetime).toHaveBeenCalledTimes(1)
    expect(second).toEqual({ ok: true, data: events })
    expect(redis.store.get("rw:batch:2026:2026-11-30:lifetime:user-1")?.ttlSeconds).toBe(86_400)
  })
})
