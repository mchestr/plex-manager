/**
 * @jest-environment node
 *
 * Redis-backed tests for lib/wrapped/share/visit-counter.ts (GAP-37), run
 * against TEST_REDIS_URL by `npm run test:integration`. The database is a
 * recording fake, so the test sees every write it would receive.
 */

import { randomUUID } from "node:crypto"

import Redis from "ioredis"

import { recordShareVisit } from "@/lib/wrapped/share/visit-counter"
import { describeRedis } from "@/test/helpers/integration"

// The counter takes its writer as a dependency; the real client is never used here.
jest.mock("@/lib/prisma", () => ({ prisma: {} }))

describeRedis("share visit counter", (redisUrl) => {
  let redis: Redis
  let writes: unknown[]
  let shareId: string
  const prisma = {
    rewindShareVisitDay: {
      upsert: async (args: unknown) => {
        writes.push(args)
        return args
      },
    },
  }

  const DAY_1 = new Date("2026-12-05T10:00:00Z")
  const DAY_2 = new Date("2026-12-06T10:00:00Z")

  beforeAll(() => {
    redis = new Redis(redisUrl)
  })

  beforeEach(async () => {
    writes = []
    shareId = `share-${randomUUID()}`
    await redis.del("rw:visitkey:2026-12-05", "rw:visitkey:2026-12-06")
  })

  afterAll(async () => {
    await redis.quit()
  })

  const visit = (ip: string, now: Date) => recordShareVisit(shareId, ip, { redis, prisma, now })

  it("counts a visitor once a day", async () => {
    expect(await visit("203.0.113.7", DAY_1)).toBe(true)
    expect(await visit("203.0.113.7", DAY_1)).toBe(false)
    expect(await visit("198.51.100.4", DAY_1)).toBe(true)
    expect(writes).toHaveLength(2)
    expect(writes[0]).toEqual({
      where: { shareId_day: { shareId, day: new Date("2026-12-05T00:00:00Z") } },
      create: { shareId, day: new Date("2026-12-05T00:00:00Z"), count: 1 },
      update: { count: { increment: 1 } },
    })
  })

  it("counts the same visitor again the next day, under a new day key", async () => {
    await visit("203.0.113.7", DAY_1)
    await visit("203.0.113.7", DAY_2)
    expect(writes).toHaveLength(2)
    const [one, two] = await Promise.all([redis.getBuffer("rw:visitkey:2026-12-05"), redis.getBuffer("rw:visitkey:2026-12-06")])
    expect(one).toHaveLength(32)
    expect(two).toHaveLength(32)
    expect(one!.equals(two!)).toBe(false)
    expect(await redis.ttl("rw:visitkey:2026-12-05")).toBeGreaterThan(47 * 3600)
  })

  it("never writes the address, or anything derived from it, to the database", async () => {
    await visit("203.0.113.7", DAY_1)
    const keys = await redis.keys(`rw:visit:${shareId}:*`)
    const mark = keys[0].split(":").pop()!
    const written = JSON.stringify(writes)
    expect(written).not.toContain("203.0.113.7")
    expect(written).not.toContain(mark)
  })
})
