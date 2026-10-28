/**
 * @jest-environment node
 */

/**
 * Redis-backed tests for lib/locks/redis-lease-store.ts, run against the
 * server in TEST_REDIS_URL. Gated by `describeRedis` and run only by
 * `npm run test:integration`. Two clients stand in for two app processes.
 */

import { randomUUID } from "node:crypto"
import Redis from "ioredis"

import { LeaseLock, type LeaseName } from "@/lib/locks/lease-lock"
import { RedisLeaseStore } from "@/lib/locks/redis-lease-store"
import { describeRedis } from "@/__tests__/helpers/integration"

describeRedis("RedisLeaseStore", (redisUrl) => {
  let inspector: Redis
  let processA: Redis
  let processB: Redis
  let name: LeaseName

  beforeAll(() => {
    inspector = new Redis(redisUrl)
    processA = new Redis(redisUrl)
    processB = new Redis(redisUrl)
  })

  beforeEach(() => {
    name = `access:user-${randomUUID()}`
  })

  afterEach(async () => {
    await inspector.del(name)
  })

  afterAll(async () => {
    await Promise.all([inspector.quit(), processA.quit(), processB.quit()])
  })

  const lockFor = (client: Redis, instanceId: string, leaseDurationMs = 30_000) =>
    new LeaseLock({ name, instanceId, leaseDurationMs, store: new RedisLeaseStore(client) })

  it("renews only while the lease is still its own", async () => {
    const a = lockFor(processA, "a")
    await expect(a.acquire()).resolves.toBe(true)
    await inspector.pexpire(name, 1000)

    await expect(a.renew()).resolves.toBe(true)
    expect(await inspector.pttl(name)).toBeGreaterThan(29_000)

    // The lease lapsed and b took it over
    await inspector.set(name, "b", "PX", 30_000)
    await expect(a.renew()).resolves.toBe(false)
    expect(await inspector.get(name)).toBe("b")
  })

  it("gives a foreign release no effect", async () => {
    const a = lockFor(processA, "a")
    await a.acquire()
    const store = new RedisLeaseStore(processB)

    await expect(store.release(name, "b")).resolves.toBe(false)

    expect(await inspector.get(name)).toBe("a")
    await expect(a.release()).resolves.toBe(true)
    expect(await inspector.exists(name)).toBe(0)
  })

  it("refuses a second holder, then hands over once the lease expires", async () => {
    const a = lockFor(processA, "a", 200)
    const b = lockFor(processB, "b", 200)
    await expect(a.acquire()).resolves.toBe(true)
    await expect(b.acquire()).resolves.toBe(false)

    await new Promise((resolve) => setTimeout(resolve, 300))

    await expect(b.acquire()).resolves.toBe(true)
    expect(await inspector.get(name)).toBe("b")
    await expect(a.renew()).resolves.toBe(false)
  })

  it("lets the same owner take back its own lease", async () => {
    await inspector.set(name, "a", "PX", 1000)

    await expect(lockFor(processB, "a").acquire()).resolves.toBe(true)
    expect(await inspector.pttl(name)).toBeGreaterThan(29_000)
  })
})
