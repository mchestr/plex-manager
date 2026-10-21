/**
 * @jest-environment node
 */

import { waitForRedis } from "@/lib/queue/connection"
import { startNodeInstrumentation } from "@/lib/instrumentation/node"
import { startWorker } from "@/lib/queue/worker"
import { scheduleRepeatingJob } from "@/lib/queue/client"

// The boot path waits for a Redis that starts after the app, with backoff, and
// gives up after eight attempts without stopping the site (BP-13).

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
}))

const mockProbe = { status: "ready" as "ready" | "wait", connect: jest.fn(), ping: jest.fn(), disconnect: jest.fn() }
jest.mock("@/lib/queue/connection", () => ({
  ...jest.requireActual("@/lib/queue/connection"),
  createFailFastRedis: () => mockProbe,
  closeRedisConnection: jest.fn(),
}))
jest.mock("@/lib/queue/worker", () => ({ startWorker: jest.fn(), stopWorker: jest.fn() }))
jest.mock("@/lib/queue/client", () => ({
  scheduleRepeatingJob: jest.fn(),
  removeScheduledJob: jest.fn(),
  closeQueue: jest.fn(),
}))
jest.mock("@/lib/watchlist/lock", () => ({
  isWatchlistSyncEnabled: jest.fn().mockResolvedValue(true),
  getWatchlistSyncInterval: jest.fn().mockResolvedValue(60),
}))

const OPTIONS = { attempts: 8, baseDelayMs: 1000, maxDelayMs: 30_000 }
const originalEnv = process.env

beforeEach(() => {
  jest.useFakeTimers()
  jest.spyOn(Math, "random").mockReturnValue(0.5) // no jitter
  mockProbe.status = "ready"
  mockProbe.connect.mockReset()
  mockProbe.ping.mockReset().mockRejectedValue(new Error("connect ECONNREFUSED"))
  jest.mocked(startWorker).mockClear()
})

afterEach(() => {
  jest.useRealTimers()
  jest.restoreAllMocks()
})

afterAll(() => {
  process.env = originalEnv
})

describe("waitForRedis()", () => {
  it("backs off 1, 2, 4, 8, 16, 30 and 30 s, and stops after 8 attempts", async () => {
    const result = waitForRedis(mockProbe, { ...OPTIONS, signal: new AbortController().signal })
    await jest.advanceTimersByTimeAsync(0)
    expect(mockProbe.ping).toHaveBeenCalledTimes(1)

    let attempts = 1
    for (const delay of [1000, 2000, 4000, 8000, 16_000, 30_000, 30_000]) {
      await jest.advanceTimersByTimeAsync(delay - 1)
      expect(mockProbe.ping).toHaveBeenCalledTimes(attempts)
      await jest.advanceTimersByTimeAsync(1)
      expect(mockProbe.ping).toHaveBeenCalledTimes(++attempts)
    }

    await expect(result).resolves.toBe(false)
    await jest.advanceTimersByTimeAsync(120_000)
    expect(mockProbe.ping).toHaveBeenCalledTimes(8)
  })

  it("keeps each delay within ±20% jitter", async () => {
    jest.spyOn(Math, "random").mockReturnValue(0.999)
    void waitForRedis(mockProbe, { ...OPTIONS, signal: new AbortController().signal })
    await jest.advanceTimersByTimeAsync(0)

    await jest.advanceTimersByTimeAsync(1199)
    expect(mockProbe.ping).toHaveBeenCalledTimes(1)
    await jest.advanceTimersByTimeAsync(1)
    expect(mockProbe.ping).toHaveBeenCalledTimes(2)
  })

  it("connects a lazy client before the first ping", async () => {
    mockProbe.status = "wait"
    mockProbe.connect.mockResolvedValue(undefined)
    mockProbe.ping.mockResolvedValue("PONG")

    await expect(waitForRedis(mockProbe, { ...OPTIONS, signal: new AbortController().signal })).resolves.toBe(true)
    expect(mockProbe.connect).toHaveBeenCalledTimes(1)
  })

  it("ends the wait when shutdownSignal aborts", async () => {
    const controller = new AbortController()
    const result = waitForRedis(mockProbe, { ...OPTIONS, signal: controller.signal })
    await jest.advanceTimersByTimeAsync(2500)
    expect(mockProbe.ping).toHaveBeenCalledTimes(2)

    controller.abort()

    await expect(result).resolves.toBe(false)
    await jest.advanceTimersByTimeAsync(120_000)
    expect(mockProbe.ping).toHaveBeenCalledTimes(2)
  })
})

describe("startNodeInstrumentation() with Redis starting late", () => {
  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: "test", REDIS_URL: "redis://localhost:6390", ENABLE_DISCORD_BOT: "false" }
  })

  it("starts the worker exactly once when the third attempt succeeds", async () => {
    mockProbe.ping
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockResolvedValue("PONG")

    // Startup's dynamic imports read files for real, which fake timers cannot
    // advance, so a single fixed advance can run before the first retry is
    // scheduled. Advance until startup has finished.
    let done = false
    const started = startNodeInstrumentation().finally(() => {
      done = true
    })
    for (let ms = 0; !done && ms < 60_000; ms += 500) await jest.advanceTimersByTimeAsync(500)
    await started

    expect(mockProbe.ping).toHaveBeenCalledTimes(3)
    expect(startWorker).toHaveBeenCalledTimes(1)
    expect(scheduleRepeatingJob).toHaveBeenCalledTimes(1)
    expect(mockProbe.disconnect).toHaveBeenCalled()
  })
})
