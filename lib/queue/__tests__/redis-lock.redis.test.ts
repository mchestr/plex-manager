/**
 * @jest-environment node
 */

/**
 * Redis-backed tests for lib/queue/redis-lock.ts, run against the server in
 * TEST_REDIS_URL. Gated by `describeRedis` and run only by
 * `npm run test:integration`. Two clients stand in for two app processes.
 */

import { randomUUID } from "node:crypto"
import Redis from "ioredis"

import { acquireGenerationLock } from "@/lib/queue/redis-lock"
import { describeRedis } from "@/test/helpers/integration"

describeRedis("redis generation lock", (redisUrl) => {
  let inspector: Redis
  let processA: Redis
  let processB: Redis
  let userId: string
  let key: string

  beforeAll(() => {
    inspector = new Redis(redisUrl)
    processA = new Redis(redisUrl)
    processB = new Redis(redisUrl)
  })

  beforeEach(() => {
    userId = `user-${randomUUID()}`
    key = `rw:lock:gen:2026:${userId}`
  })

  afterEach(async () => {
    jest.useRealTimers()
    await inspector.del(key)
  })

  afterAll(async () => {
    await Promise.all([inspector.quit(), processA.quit(), processB.quit()])
  })

  it("is held by one owner at a time, for 10 minutes", async () => {
    const lock = await acquireGenerationLock(processA, { year: 2026, userId, owner: "job-1" })

    expect(lock).not.toBeNull()
    expect(await inspector.get(key)).toBe("job-1")
    expect(await inspector.pttl(key)).toBeGreaterThan(590_000)
    expect(await acquireGenerationLock(processB, { year: 2026, userId, owner: "job-2" })).toBeNull()

    expect(await lock!.release()).toBe(true)
    const next = await acquireGenerationLock(processB, { year: 2026, userId, owner: "job-2" })
    expect(next).not.toBeNull()
    await next!.release()
  })

  it("lets the same owner take back a lock its crashed run left behind", async () => {
    // job-1's first run died holding the lock; BullMQ runs job-1 again.
    await inspector.set(key, "job-1", "PX", 30_000)

    const lock = await acquireGenerationLock(processB, { year: 2026, userId, owner: "job-1" })

    expect(lock).not.toBeNull()
    expect(await inspector.pttl(key)).toBeGreaterThan(590_000)
    expect(await lock!.release()).toBe(true)
  })

  it("can only be released by its owner", async () => {
    const lock = await acquireGenerationLock(processA, { year: 2026, userId, owner: "job-1" })
    // job-1's lock expired and job-2 took it over.
    await inspector.set(key, "job-2", "PX", 600_000)

    expect(await lock!.release()).toBe(false)
    expect(await inspector.get(key)).toBe("job-2")
  })

  it("renews only its own lock each minute", async () => {
    jest.useFakeTimers({ doNotFake: ["nextTick", "setImmediate", "setTimeout", "clearTimeout", "Date"] })
    const lock = await acquireGenerationLock(processA, { year: 2026, userId, owner: "job-1" })
    await inspector.pexpire(key, 5000)

    jest.advanceTimersByTime(60_000)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await inspector.pttl(key)).toBeGreaterThan(590_000)

    await inspector.set(key, "job-2", "PX", 5000)
    jest.advanceTimersByTime(60_000)
    await new Promise((resolve) => setTimeout(resolve, 100))
    expect(await inspector.pttl(key)).toBeLessThanOrEqual(5000)

    await lock!.release()
  })
})
