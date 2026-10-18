/**
 * @jest-environment node
 */

/**
 * Tests for lib/security/rate-limit.ts: named limits, the in-process store,
 * the 429 response, refunds, and the fallback when Redis commands fail.
 *
 * Redis itself is covered by rate-limit.redis.test.ts. Here `ioredis` is a
 * stub, so no test reaches a real server.
 */

import { headers } from "next/headers"

type RateLimitModule = typeof import("@/lib/security/rate-limit")

/** A Redis command stub that rejects, as ioredis does while Redis is down. */
const mockRedisCommand = jest.fn()
const mockRedisConstructor = jest.fn()
const mockRedisConnect = jest.fn()

jest.mock("ioredis", () => ({
  __esModule: true,
  default: class MockRedis {
    status = "ready"
    on = jest.fn()
    multi = jest.fn(() => ({}))
    connect = mockRedisConnect

    constructor(...args: unknown[]) {
      mockRedisConstructor(...args)
    }

    defineCommand(name: string) {
      Object.assign(this, { [name]: mockRedisCommand })
    }
  },
}))

jest.mock("next/headers", () => ({
  headers: jest.fn(),
}))

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

/** Loads a fresh copy of the module, so each test starts with empty counters. */
async function loadRateLimit(): Promise<RateLimitModule> {
  jest.resetModules()
  return import("@/lib/security/rate-limit")
}

async function consumeTimes(mod: RateLimitModule, name: Parameters<RateLimitModule["consume"]>[0], subject: string, times: number) {
  const results = []
  for (let i = 0; i < times; i++) {
    results.push(await mod.consume(name, subject))
  }
  return results
}

describe("rate-limit", () => {
  const originalRedisUrl = process.env.REDIS_URL

  beforeEach(() => {
    jest.clearAllMocks()
    delete process.env.REDIS_URL
    mockRedisCommand.mockRejectedValue(new Error("Connection is closed."))
    mockRedisConnect.mockResolvedValue(undefined)
  })

  afterAll(() => {
    if (originalRedisUrl === undefined) {
      delete process.env.REDIS_URL
    } else {
      process.env.REDIS_URL = originalRedisUrl
    }
  })

  describe("LIMITS", () => {
    it("keeps the existing limits and adds the sign-in, invite and PIN limits", async () => {
      const { LIMITS } = await loadRateLimit()

      expect(LIMITS).toEqual({
        share: { points: 100, duration: 900 },
        poster: { points: 500, duration: 900 },
        admin: { points: 50, duration: 900 },
        checkout: { points: 10, duration: 60 },
        portal: { points: 10, duration: 60 },
        "discord-link": { points: 5, duration: 300 },
        "auth:plex": { points: 20, duration: 900 },
        "auth:jellyfin:ip": { points: 10, duration: 900 },
        "auth:jellyfin:user": { points: 5, duration: 900 },
        "invite:validate": { points: 20, duration: 900 },
        "invite:redeem": { points: 10, duration: 900 },
        "plex:pin:create": { points: 30, duration: 600 },
        "plex:pin:poll": { points: 300, duration: 600 },
      })
    })
  })

  describe("in-process store (REDIS_URL unset)", () => {
    it("uses the memory store and never creates a Redis client", async () => {
      const mod = await loadRateLimit()

      const results = await consumeTimes(mod, "share", "203.0.113.7", 101)

      expect(results.slice(0, 100).every((result) => result.ok)).toBe(true)
      expect(results[100]).toEqual({ ok: false, retryAfterSec: expect.any(Number) })
      expect(mockRedisConstructor).not.toHaveBeenCalled()
    })

    it("keeps limits apart: 100 share hits leave admin untouched", async () => {
      const mod = await loadRateLimit()
      const ip = "203.0.113.7"

      await consumeTimes(mod, "share", ip, 100)
      expect(await mod.consume("share", ip)).toMatchObject({ ok: false })

      const adminResults = await consumeTimes(mod, "admin", ip, 50)
      expect(adminResults.every((result) => result.ok)).toBe(true)
      expect(await mod.consume("admin", ip)).toMatchObject({ ok: false })
    })

    it("keeps subjects apart within one limit", async () => {
      const mod = await loadRateLimit()

      await consumeTimes(mod, "auth:jellyfin:user", "alice", 5)

      expect(await mod.consume("auth:jellyfin:user", "alice")).toMatchObject({ ok: false })
      expect(await mod.consume("auth:jellyfin:user", "bob")).toEqual({ ok: true })
    })

    it("reports whole seconds until the window frees up", async () => {
      const mod = await loadRateLimit()

      await consumeTimes(mod, "discord-link", "user-1", 5)
      const limited = await mod.consume("discord-link", "user-1")

      expect(limited.ok).toBe(false)
      if (!limited.ok) {
        expect(Number.isInteger(limited.retryAfterSec)).toBe(true)
        expect(limited.retryAfterSec).toBeGreaterThan(290)
        expect(limited.retryAfterSec).toBeLessThanOrEqual(300)
      }
    })

    it("refunds a point with reward", async () => {
      const mod = await loadRateLimit()

      await consumeTimes(mod, "discord-link", "user-1", 5)
      await mod.reward("discord-link", "user-1")

      expect(await mod.consume("discord-link", "user-1")).toEqual({ ok: true })
      expect(await mod.consume("discord-link", "user-1")).toMatchObject({ ok: false })
    })

    it("keeps counting refused attempts, so retrying while limited does not help", async () => {
      const mod = await loadRateLimit()

      await consumeTimes(mod, "discord-link", "user-1", 6)
      await mod.reward("discord-link", "user-1")

      expect(await mod.consume("discord-link", "user-1")).toMatchObject({ ok: false })
    })
  })

  describe("limitRequest", () => {
    function request(xff: string): Request {
      return new Request("http://localhost/api/admin/models", { headers: { "x-forwarded-for": xff } })
    }

    it("returns null within the limit, then a 429 with Retry-After", async () => {
      const mod = await loadRateLimit()

      for (let i = 0; i < 50; i++) {
        expect(await mod.limitRequest("admin", request("203.0.113.7"))).toBeNull()
      }
      const response = await mod.limitRequest("admin", request("203.0.113.7"))

      expect(response?.status).toBe(429)
      const retryAfter = Number(response?.headers.get("Retry-After"))
      expect(retryAfter).toBeGreaterThan(0)
      expect(retryAfter).toBeLessThanOrEqual(900)
      await expect(response?.json()).resolves.toEqual({
        error: "Too many requests",
        code: "RATE_LIMIT_EXCEEDED",
        retryAfter,
      })
    })

    it("keys by the trusted proxy entry, so spoofed leftmost values share one bucket", async () => {
      const mod = await loadRateLimit()

      for (let i = 0; i < 50; i++) {
        expect(await mod.limitRequest("admin", request(`198.51.100.${i}, 203.0.113.7`))).toBeNull()
      }

      expect((await mod.limitRequest("admin", request("6.6.6.6, 203.0.113.7")))?.status).toBe(429)
      expect(await mod.limitRequest("admin", request("203.0.113.8"))).toBeNull()
    })
  })

  describe("actionClientIp", () => {
    it("reads the client address from the Server Action's request headers", async () => {
      const mod = await loadRateLimit()
      const { headers: mockHeaders } = jest.requireMock<{ headers: jest.MockedFunction<typeof headers> }>(
        "next/headers"
      )
      mockHeaders.mockResolvedValue(new Headers({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }) as never)

      await expect(mod.actionClientIp()).resolves.toBe("203.0.113.7")
    })
  })

  describe("Redis store", () => {
    it("creates one fail-fast client shared by every limit", async () => {
      process.env.REDIS_URL = "redis://redis.test:6379/0"
      const mod = await loadRateLimit()

      await mod.consume("share", "203.0.113.7")
      await mod.consume("admin", "203.0.113.7")

      expect(mockRedisConstructor).toHaveBeenCalledTimes(1)
      expect(mockRedisConstructor).toHaveBeenCalledWith(
        "redis://redis.test:6379/0",
        expect.objectContaining({ enableOfflineQueue: false, maxRetriesPerRequest: 1, lazyConnect: true })
      )
      expect(mockRedisConnect).toHaveBeenCalledTimes(1)
    })

    it("waits for the first connection attempt, then never again", async () => {
      process.env.REDIS_URL = "redis://redis.test:6379/0"
      let connected: () => void = () => undefined
      mockRedisConnect.mockReturnValue(new Promise<void>((resolve) => (connected = resolve)))
      mockRedisCommand.mockResolvedValue([1, 900_000])
      const mod = await loadRateLimit()

      const first = mod.consume("share", "203.0.113.7")
      await new Promise((resolve) => setImmediate(resolve))
      expect(mockRedisCommand).not.toHaveBeenCalled()

      connected()
      await expect(first).resolves.toEqual({ ok: true })
      expect(mockRedisCommand).toHaveBeenCalledTimes(1)

      await expect(mod.consume("share", "203.0.113.7")).resolves.toEqual({ ok: true })
      expect(mockRedisConnect).toHaveBeenCalledTimes(1)
    })

    it("does not throw when the first connection attempt fails", async () => {
      process.env.REDIS_URL = "redis://redis.test:6379/0"
      mockRedisConnect.mockRejectedValue(new Error("connect ECONNREFUSED"))
      const mod = await loadRateLimit()

      await expect(mod.consume("share", "203.0.113.7")).resolves.toEqual({ ok: true })
    })

    it("falls back to the insurance store without throwing when Redis commands reject", async () => {
      process.env.REDIS_URL = "redis://redis.test:6379/0"
      const mod = await loadRateLimit()

      const results = await consumeTimes(mod, "discord-link", "user-1", 6)

      expect(mockRedisCommand).toHaveBeenCalledTimes(6)
      expect(mockRedisCommand.mock.calls[0][0]).toEqual(expect.arrayContaining(["discord-link:user-1"]))
      expect(results.slice(0, 5)).toEqual(Array(5).fill({ ok: true }))
      expect(results[5]).toMatchObject({ ok: false })
    })
  })
})
