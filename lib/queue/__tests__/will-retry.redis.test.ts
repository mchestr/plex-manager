/**
 * @jest-environment node
 */

/**
 * The worker's crash-fallback decision (`willRetry`, `lib/queue/will-retry.ts`)
 * against the server in TEST_REDIS_URL: a real BullMQ queue and Worker, so the
 * claim it rests on, that BullMQ sets `finishedOn` before its `failed` event
 * only when it fails a job for good, is checked on the installed BullMQ, which
 * hand-built jobs cannot prove. A BullMQ upgrade that set it later, or never,
 * would otherwise turn the review crash fallback off without a failing test.
 */

import { randomUUID } from "node:crypto"
import { Queue, UnrecoverableError, Worker, type Job } from "bullmq"
import Redis from "ioredis"

import { describeRedis } from "@/__tests__/helpers/integration"
import { willRetry } from "@/lib/queue/will-retry"

type Failure = { attemptsMade: number; willRetry: boolean }

async function waitFor(read: () => number, count: number, timeoutMs = 10_000): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (read() < count) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${count} failures; saw ${read()}`)
    await new Promise((resolve) => setTimeout(resolve, 50))
  }
}

describeRedis("willRetry on BullMQ", (redisUrl) => {
  const connections: Redis[] = []
  const connect = () => {
    const client = new Redis(redisUrl, { maxRetriesPerRequest: null })
    connections.push(client)
    return client
  }
  let queue: Queue
  let worker: Worker
  const failures = new Map<string, Failure[]>()

  beforeAll(async () => {
    queue = new Queue(`will-retry-test-${randomUUID()}`, { connection: connect() })
    worker = new Worker(
      queue.name,
      async (job: Job) => {
        if (job.name === "unrecoverable") throw new UnrecoverableError("job stalled more than allowable limit")
        throw new Error("boom")
      },
      { connection: connect() }
    )
    // As the queue worker's own failed handler reads it
    worker.on("failed", (job) => {
      if (!job?.id) return
      failures.set(job.id, [...(failures.get(job.id) ?? []), { attemptsMade: job.attemptsMade, willRetry: willRetry(job) }])
    })
    await worker.waitUntilReady()
  })

  afterAll(async () => {
    await worker.close()
    await queue.obliterate({ force: true })
    await queue.close()
    await Promise.all(connections.map((client) => client.quit()))
  })

  it("a job that throws with 2 attempts reports that it will retry, then that it failed for good", async () => {
    const job = await queue.add("throws", {}, { attempts: 2 })

    await waitFor(() => failures.get(job.id!)?.length ?? 0, 2)

    expect(failures.get(job.id!)).toEqual([
      { attemptsMade: 1, willRetry: true },
      { attemptsMade: 2, willRetry: false },
    ])
    expect(await queue.getJobState(job.id!)).toBe("failed")
  })

  it("a job that throws UnrecoverableError on attempt 1 of 3 reports that it failed for good", async () => {
    const job = await queue.add("unrecoverable", {}, { attempts: 3 })

    await waitFor(() => failures.get(job.id!)?.length ?? 0, 1)

    expect(failures.get(job.id!)).toEqual([{ attemptsMade: 1, willRetry: false }])
    expect(await queue.getJobState(job.id!)).toBe("failed")
  })
})
