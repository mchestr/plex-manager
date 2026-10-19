/**
 * @jest-environment node
 */

/**
 * Redis-backed tests for lib/security/rate-limit.ts, run against the server in
 * TEST_REDIS_URL. Gated by `describeRedis` (test/helpers/integration.ts) and
 * run only by `npm run test:integration`.
 *
 * Two copies of the module stand in for two app processes on one Redis.
 */

import { randomInt, randomUUID } from "node:crypto"
import type Redis from "ioredis"

import { describeRedis } from "@/test/helpers/integration"

type RateLimitModule = typeof import("@/lib/security/rate-limit")

/** Every ioredis client the modules under test create, so they can be closed. */
const mockCreatedClients: Redis[] = []

jest.mock("ioredis", () => {
  const ActualRedis = jest.requireActual("ioredis").default
  return {
    __esModule: true,
    default: class TrackedRedis extends ActualRedis {
      constructor(...args: unknown[]) {
        super(...args)
        mockCreatedClients.push(this as unknown as Redis)
      }
    },
  }
})

const ActualRedis: typeof Redis = jest.requireActual("ioredis").default
const runId = randomUUID()
const touchedKeys = new Set<string>()

describeRedis("rate-limit on Redis", (redisUrl) => {
  let inspector: Redis
  let processA: RateLimitModule
  let processB: RateLimitModule

  /** Loads a fresh copy of the module pointed at the test Redis: one "process". */
  async function loadProcess(): Promise<RateLimitModule> {
    process.env.REDIS_URL = redisUrl
    jest.resetModules()
    return import("@/lib/security/rate-limit")
  }

  beforeAll(async () => {
    inspector = new ActualRedis(redisUrl)
    processA = await loadProcess()
    processB = await loadProcess()
  })

  afterAll(async () => {
    delete process.env.REDIS_URL
    if (touchedKeys.size > 0) {
      await inspector.del(...touchedKeys)
    }
    await inspector.quit()
    mockCreatedClients.forEach((client) => client.disconnect())
  })

  it("stores a request's count under the limit name as prefix, as share:<ip>", async () => {
    const ip = `198.18.${randomInt(256)}.${randomInt(256)}`
    touchedKeys.add(`share:${ip}`)
    await inspector.del(`share:${ip}`)

    const request = new Request("http://localhost/api/wrapped/share/x", {
      headers: { "x-forwarded-for": `6.6.6.6, ${ip}` },
    })
    expect(await processA.limitRequest("share", request)).toBeNull()

    expect(await inspector.get(`share:${ip}`)).toBe("1")
    const ttl = await inspector.ttl(`share:${ip}`)
    expect(ttl).toBeGreaterThan(890)
    expect(ttl).toBeLessThanOrEqual(900)
  })

  it("shares counts between two processes", async () => {
    const ip = `198.18.0.2-${runId}`
    touchedKeys.add(`admin:${ip}`)

    for (let i = 0; i < 30; i++) {
      expect(await processA.consume("admin", ip)).toEqual({ ok: true })
    }
    for (let i = 0; i < 20; i++) {
      expect(await processB.consume("admin", ip)).toEqual({ ok: true })
    }
    // Every count reached Redis, including each process's first request.
    expect(await inspector.get(`admin:${ip}`)).toBe("50")

    expect(await processB.consume("admin", ip)).toMatchObject({ ok: false })
    expect(await processA.consume("admin", ip)).toMatchObject({ ok: false })
  })

  it("keeps limits apart in Redis", async () => {
    const ip = `198.18.0.3-${runId}`
    touchedKeys.add(`poster:${ip}`)
    touchedKeys.add(`share:${ip}`)

    await processA.consume("poster", ip)
    await processB.consume("poster", ip)

    expect(await inspector.get(`poster:${ip}`)).toBe("2")
    expect(await inspector.exists(`share:${ip}`)).toBe(0)
  })

  it("refunds a point in Redis with reward", async () => {
    const subject = `user-${runId}`
    touchedKeys.add(`discord-link:${subject}`)

    for (let i = 0; i < 5; i++) {
      await processA.consume("discord-link", subject)
    }
    await processB.reward("discord-link", subject)

    expect(await inspector.get(`discord-link:${subject}`)).toBe("4")
    expect(await processA.consume("discord-link", subject)).toEqual({ ok: true })
    expect(await processB.consume("discord-link", subject)).toMatchObject({ ok: false })
  })
})
