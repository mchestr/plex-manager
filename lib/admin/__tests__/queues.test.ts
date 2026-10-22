/**
 * @jest-environment node
 */

/**
 * The queues page's reads (P10.3): the worker state comes from the workers
 * BullMQ registers in Redis (`getWorkers()`), not from this process, and the
 * jobs page total comes from `getJobCounts`.
 */

import { getQueueDashboard, listQueueJobs } from "@/lib/admin/queues"
import { getRequestPathRedis, isRedisConfigured } from "@/lib/queue/connection"

jest.mock("server-only", () => ({}))

const mockQueue = {
  getWorkers: jest.fn(),
  getJobCounts: jest.fn(),
  isPaused: jest.fn(),
  getJobSchedulers: jest.fn(),
  getJobs: jest.fn(),
}
jest.mock("bullmq", () => ({ Queue: jest.fn(() => mockQueue), QueueEvents: jest.fn() }))

const mockPing = jest.fn()
jest.mock("@/lib/queue/connection", () => ({
  isRedisConfigured: jest.fn(),
  getRedisConnection: jest.fn(),
  getRequestPathRedis: jest.fn(),
  readyWithin: jest.fn(async () => true),
}))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

const COUNTS = { waiting: 2, active: 1, completed: 40, failed: 3, delayed: 0, paused: 0, prioritized: 0 }

beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(isRedisConfigured).mockReturnValue(true)
  jest.mocked(getRequestPathRedis).mockReturnValue({ ping: mockPing } as never)
  mockPing.mockResolvedValue("PONG")
  mockQueue.getJobCounts.mockResolvedValue(COUNTS)
  mockQueue.isPaused.mockResolvedValue(false)
  mockQueue.getJobSchedulers.mockResolvedValue([
    { key: "k", id: "watchlist-sync", name: "watchlist:sync:all", every: 3_600_000, next: Date.UTC(2026, 9, 21, 13) },
  ])
  mockQueue.getWorkers.mockResolvedValue([])
})

describe("getQueueDashboard", () => {
  it("reads the worker as running when Redis lists a worker", async () => {
    mockQueue.getWorkers.mockResolvedValue([{ name: "bull:cGxleC13cmFwcGVk" }])
    const dashboard = await getQueueDashboard()
    expect(dashboard).toMatchObject({ redisConfigured: true, redisConnected: true, workerRunning: true, paused: false })
    expect(dashboard.schedulers).toEqual([
      expect.objectContaining({ id: "watchlist-sync", jobLabel: "Watchlist sync, everyone", everyMs: 3_600_000 }),
    ])
  })

  it("reads the worker as stopped when Redis lists none", async () => {
    const dashboard = await getQueueDashboard()
    expect(dashboard.workerRunning).toBe(false)
    expect(dashboard.stats).toEqual(COUNTS)
  })

  it("reads the worker as stopped when the worker list fails", async () => {
    mockQueue.getWorkers.mockRejectedValue(new Error("ERR unknown command 'CLIENT'"))
    await expect(getQueueDashboard()).resolves.toMatchObject({ redisConnected: true, workerRunning: false })
  })

  it("reports Redis unreachable without reading the queue", async () => {
    mockPing.mockRejectedValue(new Error("Connection is closed"))
    const dashboard = await getQueueDashboard()
    expect(dashboard).toMatchObject({ redisConfigured: true, redisConnected: false, workerRunning: false, paused: null, stats: null })
    expect(mockQueue.getJobCounts).not.toHaveBeenCalled()
  })

  it("reports Redis not configured", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(false)
    await expect(getQueueDashboard()).resolves.toMatchObject({ redisConfigured: false, stats: null })
  })
})

function job(id: string, name: string, timestamp: number) {
  return { id, name, timestamp, attemptsMade: 1, opts: { attempts: 3 }, data: { secret: "x" }, failedReason: "boom" }
}

describe("listQueueJobs", () => {
  it("totals one status from getJobCounts and pages it in Redis", async () => {
    mockQueue.getJobs.mockResolvedValue([job("a", "stripe:webhook", 2)])
    const result = await listQueueJobs({ status: "failed", page: 2, pageSize: 25 })
    expect(mockQueue.getJobs).toHaveBeenCalledWith(["failed"], 25, 49)
    expect(result.total).toBe(3)
    expect(result.rows).toEqual([
      expect.objectContaining({ id: "a", typeLabel: "Stripe event", status: "failed", attempts: 1, maxAttempts: 3, error: "boom" }),
    ])
    expect(result.rows[0]).not.toHaveProperty("data")
  })

  it("merges every status newest first and totals them", async () => {
    mockQueue.getJobs.mockImplementation(async ([status]: string[]) =>
      status === "waiting" ? [job("w", "watchlist:sync:user", 5)] : status === "completed" ? [job("c", "watchlist:sync:all", 9)] : []
    )
    const result = await listQueueJobs({ page: 1, pageSize: 25 })
    expect(result.total).toBe(46)
    expect(result.rows.map((row) => row.id)).toEqual(["c", "w"])
  })

  it("counts the matches itself when filtered to a job type", async () => {
    mockQueue.getJobs.mockImplementation(async ([status]: string[]) =>
      status === "failed" ? [job("f1", "stripe:webhook", 1), job("f2", "watchlist:sync:user", 2)] : []
    )
    const result = await listQueueJobs({ jobType: "stripe:webhook", page: 1, pageSize: 25 })
    expect(result.total).toBe(1)
    expect(result.rows.map((row) => row.id)).toEqual(["f1"])
  })
})
