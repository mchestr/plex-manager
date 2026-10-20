/**
 * @jest-environment node
 */

/**
 * Tests for the `rewind-batch` jobs (P2.6): one server-wide `get_history`
 * pass per batch, whatever the number of members.
 */

import type { Job } from "bullmq"

import { prisma } from "@/lib/prisma"
import { REWIND_BATCH_PROCESSORS } from "@/lib/queue/jobs/rewind-batch"
import { enqueueMetadataWarm } from "@/lib/queue/rewind-batch-queue"
import { JOB_TYPES } from "@/lib/queue/types"
import { fakeRedis, type FakeRedis } from "@/lib/wrapped/aggregate/__tests__/fake-redis"
import { batchCacheRedis } from "@/lib/wrapped/aggregate/batch-cache"
import { serverAggregateSchema } from "@/lib/wrapped/aggregate/schema"

import historyPage from "@/lib/wrapped/sources/__tests__/fixtures/tautulli-history-page-1.json"
import plexSectionPage from "@/lib/wrapped/sources/__tests__/fixtures/plex-section-page.json"

jest.mock("@/lib/prisma", () => ({
  prisma: {
    $transaction: jest.fn(async (ops: Promise<unknown>[]) => Promise.all(ops)),
    config: { findUnique: jest.fn() },
    tautulli: { findFirst: jest.fn() },
    overseerr: { findFirst: jest.fn() },
    plexServer: { findFirst: jest.fn() },
    user: { findMany: jest.fn() },
    rewindExclusion: { findMany: jest.fn(async () => []) },
    mediaMetadataCache: { findMany: jest.fn(async () => []), upsert: jest.fn(async () => ({})) },
    rewindServerAggregate: { upsert: jest.fn(async () => ({ id: "agg-1" })) },
  },
}))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn(async () => "America/Chicago") }))
jest.mock("@/lib/queue/redis-semaphore", () => ({ redisLimiter: { run: jest.fn((_service, fn) => fn()) } }))
jest.mock("@/lib/queue/rewind-batch-queue", () => ({ enqueueMetadataWarm: jest.fn(async () => ({})) }))
jest.mock("@/lib/wrapped/aggregate/batch-cache", () => ({
  ...jest.requireActual("@/lib/wrapped/aggregate/batch-cache"),
  batchCacheRedis: jest.fn(),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const template = historyPage.response.data.data[0]
const plexIds = ["101", "102", "103", "104", "105", "106"]
const started = Date.parse("2026-03-10T02:00:00Z") / 1000

/** Two plays per member and one for an unmatched user, as Tautulli sends them. */
const historyRows = [...plexIds, "999"].flatMap((userId, i) =>
  [0, 1].map((n) => ({
    ...template,
    user_id: Number(userId),
    started: started + i * 86_400 + n * 7200,
    stopped: started + i * 86_400 + n * 7200 + 3600,
    play_duration: 3600,
    rating_key: 50_011 + n,
  }))
)

const envelope = (data: unknown) => ({ response: { result: "success", message: null, data } })
const json = (body: unknown) => new Response(JSON.stringify(body), { status: 200 })
let historyFails = false
const mockFetch = jest.fn(async (input: string | URL | Request) => {
  const url = new URL(String(input))
  if (url.pathname === "/api/v2" && url.searchParams.get("cmd") === "get_users") {
    return json(envelope([...plexIds, "999"].map((id) => ({ user_id: Number(id), username: `user${id}`, friendly_name: `User ${id}`, email: `${id}@example.com` }))))
  }
  if (url.pathname === "/api/v2" && url.searchParams.get("cmd") === "get_history") {
    if (historyFails) return json({ response: { result: "error", message: "boom", data: {} } })
    return json(envelope({ recordsFiltered: historyRows.length, recordsTotal: historyRows.length, data: historyRows }))
  }
  if (url.pathname === "/library/sections") return json({ MediaContainer: { Directory: [{ key: "1", type: "movie", title: "Films" }] } })
  if (url.pathname === "/library/sections/1/all") return json(plexSectionPage)
  return new Response("not found", { status: 404 })
})

const historyCalls = () =>
  mockFetch.mock.calls.map(([input]) => new URL(String(input))).filter((url) => url.searchParams.get("cmd") === "get_history")

let redis: FakeRedis

beforeEach(() => {
  jest.clearAllMocks()
  historyFails = false
  global.fetch = mockFetch as unknown as typeof fetch
  redis = fakeRedis()
  jest.mocked(batchCacheRedis).mockResolvedValue(redis)
  jest.mocked(prisma.config.findUnique).mockResolvedValue(null)
  jest.mocked(prisma.tautulli.findFirst).mockResolvedValue({ url: "http://tautulli.local:8181", apiKey: "t-key" } as never)
  jest.mocked(prisma.overseerr.findFirst).mockResolvedValue(null)
  jest.mocked(prisma.plexServer.findFirst).mockResolvedValue({ url: "http://plex.local:32400", token: "p-token" } as never)
  jest.mocked(prisma.user.findMany).mockResolvedValue([
    ...plexIds.map((id) => ({ id: `user-${id}`, plexUserId: id, timezone: id === "102" ? "Australia/Sydney" : null })),
    { id: "user-555", plexUserId: "555", timezone: null },
  ] as never)
})

const job = (name: string, data: unknown) => ({ name, data }) as Job

describe("REWIND_SERVER_AGGREGATE", () => {
  const run = () =>
    REWIND_BATCH_PROCESSORS[JOB_TYPES.REWIND_SERVER_AGGREGATE](
      job(JOB_TYPES.REWIND_SERVER_AGGREGATE, { year: 2026, through: "2026-11-30" })
    )

  it("reads the history once, server-wide, for six members", async () => {
    const result = await run()

    const calls = historyCalls()
    expect(calls).toHaveLength(1)
    expect(calls[0].searchParams.has("user_id")).toBe(false)
    expect(calls[0].searchParams.get("grouping")).toBe("1")
    expect(calls[0].searchParams.get("after")).toBe("2025-12-30")
    expect(mockFetch.mock.calls.map(([input]) => String(input)).join(" ")).not.toMatch(/get_item_user_stats|get_home_stats/)
    expect(result).toMatchObject({ aggregateId: "agg-1", members: 6, historyPages: 1 })
  })

  it("upserts the aggregate on (year, dataThrough) with every member and no names", async () => {
    await run()

    const [{ where, create }] = jest.mocked(prisma.rewindServerAggregate.upsert).mock.calls.at(-1)!
    expect(where).toEqual({ year_dataThrough: { year: 2026, dataThrough: new Date("2026-11-30T00:00:00.000Z") } })
    const data = serverAggregateSchema.parse(create.data)
    expect(data.members.filter((m) => m.userId)).toHaveLength(6)
    expect(data.members).toContainEqual({ userId: null, minutes: 120 })
    expect(JSON.stringify(data)).not.toMatch(/user1\d\d|example\.com/)
  })

  it("stores each matched member's plays and the library listing in the batch cache, and queues the warm", async () => {
    await run()

    expect([...redis.store.keys()].sort()).toEqual([
      "rw:batch:2026:2026-11-30:library",
      ...plexIds.map((id) => `rw:batch:2026:2026-11-30:events:user-${id}`),
    ].sort())
    expect(enqueueMetadataWarm).toHaveBeenCalledWith({ batch: "2026:0", keys: ["50000"], topSeries: ["50000"] })
  })

  it("upserts the library's films into the metadata cache", async () => {
    await run()

    expect(prisma.mediaMetadataCache.upsert).toHaveBeenCalledTimes(plexSectionPage.MediaContainer.Metadata.length)
  })

  it("fails for a retry when the history pass fails", async () => {
    historyFails = true

    await expect(run()).rejects.toThrow(/history pass failed: TAUTULLI_ERROR/)
    expect(prisma.rewindServerAggregate.upsert).not.toHaveBeenCalled()
    expect(enqueueMetadataWarm).not.toHaveBeenCalled()
  })
})
