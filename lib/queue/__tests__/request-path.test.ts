/**
 * @jest-environment node
 */

/**
 * Request-path enqueues fail fast (BP-20, P11.3): with Redis unreachable,
 * `enqueueFromRequest` answers `QUEUE_UNAVAILABLE` within about two seconds
 * instead of hanging the request on the BullMQ connection. Runs the real
 * BullMQ and ioredis against a port nothing listens on.
 */

import { enqueueFromRequest, withRequestPathQueue } from "@/lib/queue/request-path"
import { JOB_TYPES } from "@/lib/queue/types"

// Collect the close tasks, so the test closes the clients it opened
const mockCloseTasks: Array<() => Promise<unknown>> = []
jest.mock("@/lib/instrumentation/shutdown", () => ({
  onShutdown: (_name: string, _phase: string, fn: () => Promise<unknown>) => mockCloseTasks.push(fn),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const originalRedisUrl = process.env.REDIS_URL

beforeAll(() => {
  // Port 1 on loopback: the connection is refused at once
  process.env.REDIS_URL = "redis://127.0.0.1:1"
})

afterAll(async () => {
  await Promise.allSettled(mockCloseTasks.map((close) => close()))
  if (originalRedisUrl === undefined) delete process.env.REDIS_URL
  else process.env.REDIS_URL = originalRedisUrl
})

describe("enqueueFromRequest against a closed port", () => {
  it("answers QUEUE_UNAVAILABLE within 2.5 s", async () => {
    const started = Date.now()

    const result = await enqueueFromRequest(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })

    expect(result).toEqual({ ok: false, code: "QUEUE_UNAVAILABLE" })
    expect(Date.now() - started).toBeLessThan(2500)
  }, 10_000)

  it("never runs the queue work while Redis is down", async () => {
    const work = jest.fn()

    await expect(withRequestPathQueue("test", work)).resolves.toEqual({ ok: false, code: "QUEUE_UNAVAILABLE" })
    expect(work).not.toHaveBeenCalled()
  }, 10_000)
})
