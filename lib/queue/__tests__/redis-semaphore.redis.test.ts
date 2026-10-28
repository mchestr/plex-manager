/**
 * @jest-environment node
 */

/**
 * Redis-backed tests for lib/queue/redis-semaphore.ts, run against the server
 * in TEST_REDIS_URL. Gated by `describeRedis` and run only by
 * `npm run test:integration`. Two semaphores on two clients stand in for two
 * app processes.
 */

import Redis from "ioredis"

import { createRedisSemaphore, type RedisSemaphore, type SemaphoreHolder } from "@/lib/queue/redis-semaphore"
import { describeRedis } from "@/__tests__/helpers/integration"

const KEY = "rw:sem:tautulli"

describeRedis("redis semaphore", (redisUrl) => {
  let inspector: Redis
  let clientA: Redis
  let clientB: Redis
  let processA: RedisSemaphore
  let processB: RedisSemaphore

  beforeAll(() => {
    inspector = new Redis(redisUrl)
    clientA = new Redis(redisUrl)
    clientB = new Redis(redisUrl)
    const fast = { minBackoffMs: 10, maxBackoffMs: 40 }
    processA = createRedisSemaphore(() => clientA, fast)
    processB = createRedisSemaphore(() => clientB, fast)
  })

  beforeEach(async () => {
    await inspector.del(KEY)
  })

  afterAll(async () => {
    await inspector.del(KEY)
    await Promise.all([inspector.quit(), clientA.quit(), clientB.quit()])
  })

  async function fill(): Promise<SemaphoreHolder[]> {
    return Promise.all([
      processA.acquire("tautulli"),
      processA.acquire("tautulli"),
      processB.acquire("tautulli"),
      processB.acquire("tautulli"),
    ])
  }

  it("makes a fifth holder wait until a slot is released", async () => {
    const holders = await fill()
    expect(await inspector.zcard(KEY)).toBe(4)

    let fifthAdmitted = false
    const fifth = processB.acquire("tautulli").then((holder) => {
      fifthAdmitted = true
      return holder
    })
    await new Promise((resolve) => setTimeout(resolve, 200))
    expect(fifthAdmitted).toBe(false)

    await holders[0].release()
    const holder = await fifth
    expect(fifthAdmitted).toBe(true)
    expect(await inspector.zcard(KEY)).toBe(4)

    await Promise.all([holder, ...holders.slice(1)].map((h) => h.release()))
    expect(await inspector.zcard(KEY)).toBe(0)
  })

  it("never runs more than four calls at once across two processes", async () => {
    let running = 0
    let peak = 0
    const call = async () => {
      running++
      peak = Math.max(peak, running)
      await new Promise((resolve) => setTimeout(resolve, 30))
      running--
    }

    await Promise.all(
      Array.from({ length: 10 }, (_, i) => (i % 2 === 0 ? processA : processB).run("tautulli", call))
    )

    expect(peak).toBe(4)
    expect(await inspector.zcard(KEY)).toBe(0)
  })

  it("evicts a holder whose TTL has passed", async () => {
    const shortLived = createRedisSemaphore(() => clientA, { ttlMs: 300, minBackoffMs: 10, maxBackoffMs: 40 })
    const crashed = await Promise.all(Array.from({ length: 4 }, () => shortLived.acquire("tautulli")))

    await new Promise((resolve) => setTimeout(resolve, 400))
    const holder = await processB.acquire("tautulli")

    expect(await inspector.zcard(KEY)).toBe(1)
    expect(await crashed[0].renew()).toBe(false)
    await holder.release()
  })

  it("rejects a waiter whose signal aborts, without taking a slot", async () => {
    const holders = await fill()
    const controller = new AbortController()
    const waiter = processA.acquire("tautulli", controller.signal)

    setTimeout(() => controller.abort(new Error("stop")), 100)

    await expect(waiter).rejects.toThrow("stop")
    expect(await inspector.zcard(KEY)).toBe(4)
    await Promise.all(holders.map((h) => h.release()))
  })

  it("releases the slot when the call throws", async () => {
    await expect(
      processA.run("tautulli", async () => {
        throw new Error("upstream down")
      })
    ).rejects.toThrow("upstream down")
    expect(await inspector.zcard(KEY)).toBe(0)
  })
})
