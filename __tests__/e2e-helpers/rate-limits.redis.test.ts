/**
 * @jest-environment node
 */

/**
 * Redis-backed test for e2e/helpers/rate-limits.ts, the E2E global setup's
 * cleanup of limiter counters.
 *
 * It deletes every limiter key in the database it is given, so it runs on
 * database 15 of the TEST_REDIS_URL server, away from the other Redis suites
 * that may be counting in parallel.
 */

import Redis from "ioredis"

import { clearRateLimits } from "@/e2e/helpers/rate-limits"

const testRedisUrl = process.env.TEST_REDIS_URL
if (!testRedisUrl) {
  throw new Error("TEST_REDIS_URL is required for the Redis-backed E2E helper tests")
}

const isolatedUrl = new URL(testRedisUrl)
isolatedUrl.pathname = "/15"
const redisUrl = isolatedUrl.toString()

describe("clearRateLimits", () => {
  const redis = new Redis(redisUrl)

  afterAll(async () => {
    await redis.del("bull:queue:job-1", "unrelated:share:1", "sharepoint:1")
    await redis.quit()
  })

  it("deletes the counters under every limit prefix and leaves other keys alone", async () => {
    await redis.set("share:203.0.113.7", "3")
    await redis.set("invite:validate:2001:db8:1:2::/64", "14")
    await redis.set("auth:jellyfin:user:abc123", "2")
    await redis.set("bull:queue:job-1", "job")
    await redis.set("unrelated:share:1", "x")
    await redis.set("sharepoint:1", "x")

    const deleted = await clearRateLimits(redisUrl)

    expect(deleted).toBe(3)
    expect(await redis.exists("share:203.0.113.7", "invite:validate:2001:db8:1:2::/64", "auth:jellyfin:user:abc123")).toBe(0)
    expect(await redis.exists("bull:queue:job-1", "unrelated:share:1", "sharepoint:1")).toBe(3)
  })

  it("returns null instead of throwing when Redis is unreachable", async () => {
    const warn = jest.spyOn(console, "warn").mockImplementation(() => undefined)
    try {
      await expect(clearRateLimits("redis://127.0.0.1:1/0")).resolves.toBeNull()
      expect(warn).toHaveBeenCalledWith(
        "[E2E Setup] Could not clear rate-limit counters in Redis:",
        expect.any(String)
      )
    } finally {
      warn.mockRestore()
    }
  })
})
