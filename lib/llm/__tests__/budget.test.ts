/**
 * Tests for lib/llm/budget.ts: the assistant's daily spend caps (P4.20, SEC-23).
 */

import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { addSpend, checkSpend, spendCacheKey } from "@/lib/llm/budget"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

/** A Redis stand-in holding strings, with the commands the budget uses. */
class FakeRedis {
  store = new Map<string, string>()
  failing = false
  sets: unknown[][] = []

  private check() {
    if (this.failing) return Promise.reject(new Error("Connection is closed."))
    return null
  }

  get(key: string) {
    return this.check() ?? Promise.resolve(this.store.get(key) ?? null)
  }

  set(key: string, value: string, ...options: unknown[]) {
    this.sets.push([key, value, ...options])
    if (options.includes("NX") && this.store.has(key)) return this.check() ?? Promise.resolve(null)
    this.store.set(key, value)
    return this.check() ?? Promise.resolve("OK")
  }

  /** Runs the increment-if-cached script. */
  eval(_script: string, _keys: number, key: string, amount: string) {
    const failed = this.check()
    if (failed) return failed
    if (!this.store.has(key)) return Promise.resolve(null)
    const next = Number(this.store.get(key)) + Number(amount)
    this.store.set(key, String(next))
    return Promise.resolve(String(next))
  }
}

const mockRedis = new FakeRedis()
let mockRedisConfigured = false

jest.mock("@/lib/queue/connection", () => ({
  isRedisConfigured: () => mockRedisConfigured,
  getRequestPathRedis: () => mockRedis,
}))

type Aggregate = Awaited<ReturnType<typeof prismaMock.lLMUsage.aggregate>>
const spent = (cost: number | null) => ({ _sum: { cost } }) as Aggregate

/** Mid-afternoon on 2026-11-19 in Los Angeles. */
const NOW = new Date("2026-11-19T22:00:00Z")
const LA_DAY_START = new Date("2026-11-19T08:00:00Z")

/** Today's spend for one check: the member's sum first, then the server's, as `checkSpend` asks. */
function spendToday(user: number, server: number) {
  prismaMock.lLMUsage.aggregate.mockResolvedValueOnce(spent(user)).mockResolvedValueOnce(spent(server))
}

beforeEach(() => {
  mockReset(prismaMock)
  mockRedis.store.clear()
  mockRedis.sets = []
  mockRedis.failing = false
  mockRedisConfigured = false
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ timezone: "America/Los_Angeles" }))
})

describe("checkSpend", () => {
  it("lets a call through under every cap", async () => {
    spendToday(0.49, 4.99)

    expect(await checkSpend({ userId: "user-1", isAdmin: false }, NOW)).toEqual({ ok: true })
  })

  it("sums today's assistant rows for the user and for the server", async () => {
    spendToday(0, 0)

    await checkSpend({ userId: "user-1", isAdmin: false }, NOW)

    const wheres = prismaMock.lLMUsage.aggregate.mock.calls.map(([args]) => args.where)
    expect(wheres).toEqual([
      { chatConversationId: { not: null }, userId: "user-1", createdAt: { gte: LA_DAY_START } },
      { chatConversationId: { not: null }, createdAt: { gte: LA_DAY_START } },
    ])
  })

  it("refuses a member at the member cap", async () => {
    spendToday(0.5, 1)

    expect(await checkSpend({ userId: "user-1", isAdmin: false }, NOW)).toEqual({ ok: false, scope: "user" })
  })

  it("holds an admin to the admin cap instead", async () => {
    spendToday(4.99, 4.99)
    expect(await checkSpend({ userId: "admin-1", isAdmin: true }, NOW)).toEqual({ ok: true })

    spendToday(5, 5)
    expect(await checkSpend({ userId: "admin-1", isAdmin: true }, NOW)).toEqual({ ok: false, scope: "user" })
  })

  it("refuses everyone once the server cap is reached", async () => {
    prismaMock.config.findUnique.mockResolvedValue(
      buildConfig({ timezone: "America/Los_Angeles", llmDailyCapServerUsd: 2 })
    )
    spendToday(0, 2)

    expect(await checkSpend({ userId: "user-1", isAdmin: false }, NOW)).toEqual({ ok: false, scope: "server" })
  })

  it("refuses every call for a tier whose cap is 0", async () => {
    prismaMock.config.findUnique.mockResolvedValue(
      buildConfig({ timezone: "America/Los_Angeles", llmDailyCapPerUserUsd: 0 })
    )
    spendToday(0, 0)

    expect(await checkSpend({ userId: "user-1", isAdmin: false }, NOW)).toEqual({ ok: false, scope: "user" })
  })

  it("uses the column defaults without a Config row, and treats no rows as nothing spent", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)
    prismaMock.lLMUsage.aggregate.mockResolvedValue(spent(null))

    expect(await checkSpend({ userId: "user-1", isAdmin: false }, NOW)).toEqual({ ok: true })
  })

  describe("the day boundary in America/Los_Angeles", () => {
    it("counts from local midnight, not UTC midnight", async () => {
      spendToday(0, 0)
      spendToday(0, 0)

      // 23:30 on 18 November in Los Angeles, already the 19th in UTC
      await checkSpend({ userId: "user-1", isAdmin: false }, new Date("2026-11-19T07:30:00Z"))
      // 00:30 on the 19th in Los Angeles
      await checkSpend({ userId: "user-1", isAdmin: false }, new Date("2026-11-19T08:30:00Z"))

      const starts = prismaMock.lLMUsage.aggregate.mock.calls.map(([args]) => args.where?.createdAt)
      expect(starts).toEqual([
        { gte: new Date("2026-11-18T08:00:00Z") },
        { gte: new Date("2026-11-18T08:00:00Z") },
        { gte: LA_DAY_START },
        { gte: LA_DAY_START },
      ])
    })

    it("keys the cache by the local day", async () => {
      mockRedisConfigured = true
      spendToday(0.1, 0.2)

      await checkSpend({ userId: "user-1", isAdmin: false }, new Date("2026-11-19T07:30:00Z"))

      expect([...mockRedis.store.keys()].sort()).toEqual(["llm:spend:2026-11-18:server", "llm:spend:2026-11-18:user-1"])
    })
  })

  describe("the Redis cache", () => {
    beforeEach(() => {
      mockRedisConfigured = true
    })

    it("caches each sum for 60 seconds, and reads the cache next time", async () => {
      spendToday(0.1, 0.2)

      await checkSpend({ userId: "user-1", isAdmin: false }, NOW)
      expect(mockRedis.sets).toEqual([
        ["llm:spend:2026-11-19:user-1", "0.1", "EX", 60, "NX"],
        ["llm:spend:2026-11-19:server", "0.2", "EX", 60, "NX"],
      ])

      prismaMock.lLMUsage.aggregate.mockClear()
      expect(await checkSpend({ userId: "user-1", isAdmin: false }, NOW)).toEqual({ ok: true })
      expect(prismaMock.lLMUsage.aggregate).not.toHaveBeenCalled()
    })

    it("adds each recorded call to the cached sums, so the next check sees it", async () => {
      spendToday(0.45, 1)
      await checkSpend({ userId: "user-1", isAdmin: false }, NOW)

      await addSpend("user-1", 0.06, NOW)

      expect(Number(mockRedis.store.get(spendCacheKey("2026-11-19", "user-1")))).toBeCloseTo(0.51)
      expect(Number(mockRedis.store.get(spendCacheKey("2026-11-19", "server")))).toBeCloseTo(1.06)
      expect(await checkSpend({ userId: "user-1", isAdmin: false }, NOW)).toEqual({ ok: false, scope: "user" })
    })

    it("never creates a sum from an increment alone", async () => {
      await addSpend("user-1", 0.06, NOW)

      expect(mockRedis.store.size).toBe(0)
    })

    it("reads the database while Redis is down", async () => {
      mockRedis.failing = true
      spendToday(0.6, 1)

      expect(await checkSpend({ userId: "user-1", isAdmin: false }, NOW)).toEqual({ ok: false, scope: "user" })
      await expect(addSpend("user-1", 0.06, NOW)).resolves.toBeUndefined()
    })
  })

  describe("failing closed", () => {
    it("refuses the call when the aggregate throws", async () => {
      prismaMock.lLMUsage.aggregate.mockRejectedValue(new Error("Can't reach database server"))

      expect(await checkSpend({ userId: "user-1", isAdmin: true }, NOW)).toEqual({ ok: false, scope: "unavailable" })
    })

    it("refuses the call when the caps cannot be read", async () => {
      prismaMock.config.findUnique.mockRejectedValue(new Error("timeout"))
      spendToday(0, 0)

      expect(await checkSpend({ userId: "user-1", isAdmin: false }, NOW)).toEqual({ ok: false, scope: "unavailable" })
    })
  })
})
