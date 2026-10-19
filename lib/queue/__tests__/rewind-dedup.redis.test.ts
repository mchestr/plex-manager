/**
 * @jest-environment node
 */

/**
 * The BullMQ behaviour `enqueueRewindGeneration` relies on (P2.17), against
 * the server in TEST_REDIS_URL: an add with a live deduplication id hands back
 * the live job's id instead of its own, and once that job is gone the same id
 * enqueues again (a fixed `jobId` would not, for 24 hours). The queue runs on
 * a fail-fast client, as `getRewindQueue` does.
 */

import { randomUUID } from "node:crypto"
import { Queue } from "bullmq"
import type Redis from "ioredis"

import { createFailFastRedis, readyWithin } from "@/lib/queue/connection"
import { describeRedis } from "@/test/helpers/integration"

describeRedis("rewind-gen deduplication", (redisUrl) => {
  let connection: Redis
  let queue: Queue

  beforeAll(async () => {
    connection = createFailFastRedis(redisUrl)
    expect(await readyWithin(connection, 2000)).toBe(true)
    queue = new Queue(`rewind-gen-test-${randomUUID()}`, { connection })
  })

  afterAll(async () => {
    await queue.obliterate({ force: true })
    await queue.close()
    await connection.quit()
  })

  it("returns the live job for a second request, and a new job once it is gone", async () => {
    const deduplication = { id: `rewind:gen:2026:${randomUUID()}` }

    const first = await queue.add("rewind:generate:user", {}, { jobId: "gen-a", deduplication })
    const second = await queue.add("rewind:generate:user", {}, { jobId: "gen-b", deduplication })

    expect(first.id).toBe("gen-a")
    expect(second.id).toBe("gen-a")
    expect(await queue.getJob("gen-b")).toBeUndefined()

    await first.remove()
    const third = await queue.add("rewind:generate:user", {}, { jobId: "gen-c", deduplication })
    expect(third.id).toBe("gen-c")
  })
})
