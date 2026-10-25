/**
 * @jest-environment node
 */

/**
 * The main queue's operations (P11.22): one lazily built `plex-wrapped`
 * Queue on the shared connection with the default job options; stats, pages
 * of jobs newest first, retry and removal of one job, deduplicated removal,
 * schedulers, pause and resume, and close. BullMQ is a stand-in here;
 * `job-id-policy.test.ts` covers `addJob`'s id policy.
 */

import { Queue } from "bullmq"

import {
  DEFAULT_JOB_OPTIONS,
  QUEUE_NAME,
  addJob,
  closeQueue,
  getJobPage,
  getJobSchedulers,
  getQueueStats,
  getWorkerCount,
  isQueuePaused,
  pauseQueue,
  removeDeduplicatedJob,
  removeJob,
  removeScheduledJob,
  resumeQueue,
  retryJob,
  scheduleCronJob,
  scheduleRepeatingJob,
} from "@/lib/queue/client"
import { getRedisConnection } from "@/lib/queue/connection"
import { JOB_TYPES } from "@/lib/queue/types"

const mockQueue = {
  add: jest.fn(),
  addBulk: jest.fn(),
  upsertJobScheduler: jest.fn(),
  removeJobScheduler: jest.fn(),
  getJobSchedulers: jest.fn(),
  getJobCounts: jest.fn(),
  getJobs: jest.fn(),
  getWorkers: jest.fn(),
  getJob: jest.fn(),
  getDeduplicationJobId: jest.fn(),
  remove: jest.fn(),
  removeDeduplicationKey: jest.fn(),
  pause: jest.fn(),
  resume: jest.fn(),
  isPaused: jest.fn(),
  close: jest.fn(),
}

// A copy per Queue: traceQueue replaces add and addBulk on the instance
jest.mock("bullmq", () => ({ Queue: jest.fn(() => ({ ...mockQueue })), QueueEvents: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ getRedisConnection: jest.fn(() => ({ connection: "shared" })) }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
}))

/** A BullMQ job as `getJobs` returns it. */
function job(id: string, name: string, timestamp: number, extra: Record<string, unknown> = {}) {
  return { id, name, timestamp, data: {}, returnvalue: null, failedReason: undefined, attemptsMade: 0, opts: {}, progress: 0, ...extra }
}

beforeEach(() => {
  for (const fn of Object.values(mockQueue)) fn.mockReset()
})

afterAll(async () => {
  await closeQueue()
})

describe("the queue", () => {
  it("is built once, on first use, on the shared connection with the default options", async () => {
    expect(Queue).not.toHaveBeenCalled()
    mockQueue.isPaused.mockResolvedValue(false)

    await isQueuePaused()
    await isQueuePaused()

    expect(Queue).toHaveBeenCalledTimes(1)
    expect(Queue).toHaveBeenCalledWith(QUEUE_NAME, { connection: { connection: "shared" }, defaultJobOptions: DEFAULT_JOB_OPTIONS })
    expect(getRedisConnection).toHaveBeenCalledTimes(1)
  })

  it("adds a job under its policy id and returns the id", async () => {
    mockQueue.add.mockResolvedValue({ id: "job-1" })

    await expect(addJob(JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "admin" })).resolves.toBe("job-1")
    expect(mockQueue.add).toHaveBeenCalledWith(
      JOB_TYPES.WATCHLIST_SYNC_ALL,
      { triggeredBy: "admin" },
      expect.objectContaining({ deduplication: { id: "watchlist:all" } })
    )
  })

  it("reports zero for a state BullMQ leaves out", async () => {
    mockQueue.getJobCounts.mockResolvedValue({ waiting: 2, failed: 1 })

    await expect(getQueueStats()).resolves.toEqual({
      waiting: 2,
      active: 0,
      completed: 0,
      failed: 1,
      delayed: 0,
      paused: 0,
      prioritized: 0,
    })
  })

  it("counts the workers BullMQ has registered", async () => {
    mockQueue.getWorkers.mockResolvedValue([{}, {}])

    await expect(getWorkerCount()).resolves.toBe(2)
  })
})

describe("getJobPage", () => {
  it("pages one state in Redis and maps each job", async () => {
    mockQueue.getJobs.mockResolvedValue([
      job("7", "watchlist:sync", 2000, { processedOn: 2100, finishedOn: 2200, failedReason: "boom", attemptsMade: 3, opts: { attempts: 5 } }),
    ])
    mockQueue.getJobCounts.mockResolvedValue({ failed: 41 })

    const page = await getJobPage({ status: "failed", page: 3, pageSize: 20 })

    expect(mockQueue.getJobs).toHaveBeenCalledWith(["failed"], 40, 59)
    expect(mockQueue.getJobCounts).toHaveBeenCalledWith("failed")
    expect(page.total).toBe(41)
    expect(page.jobs).toEqual([
      expect.objectContaining({
        jobId: "7",
        jobType: "watchlist:sync",
        status: "failed",
        error: "boom",
        attempts: 3,
        maxAttempts: 5,
        createdAt: new Date(2000),
        startedAt: new Date(2100),
        finishedAt: new Date(2200),
      }),
    ])
  })

  it("merges every listed state newest first and slices the page", async () => {
    mockQueue.getJobs.mockImplementation(async ([state]: string[]) =>
      state === "waiting" ? [job("a", "x", 1000)] : state === "completed" ? [job("b", "x", 3000), job("c", "x", 2000)] : []
    )
    mockQueue.getJobCounts.mockResolvedValue({ waiting: 1, completed: 2 })

    const page = await getJobPage({ page: 1, pageSize: 2 })

    expect(page.total).toBe(3)
    expect(page.jobs.map((j) => [j.jobId, j.status])).toEqual([
      ["b", "completed"],
      ["c", "completed"],
    ])
    expect(page.jobs[0]).toEqual(expect.objectContaining({ maxAttempts: 3, startedAt: undefined, finishedAt: undefined }))
  })

  it("filters one job type over every job and counts the matches", async () => {
    mockQueue.getJobs.mockImplementation(async ([state]: string[]) =>
      state === "active" ? [job("a", JOB_TYPES.WATCHLIST_SYNC_ALL, 1000), job("b", "other", 2000), job("c", JOB_TYPES.WATCHLIST_SYNC_ALL, 3000)] : []
    )

    const page = await getJobPage({ jobType: JOB_TYPES.WATCHLIST_SYNC_ALL, page: 2, pageSize: 1 })

    expect(mockQueue.getJobs).toHaveBeenCalledWith(["active"], 0, -1)
    expect(mockQueue.getJobCounts).not.toHaveBeenCalled()
    expect(page).toEqual({ jobs: [expect.objectContaining({ jobId: "a" })], total: 2 })
  })
})

describe("one job", () => {
  it("retries and removes a job it finds", async () => {
    const found = { retry: jest.fn(), remove: jest.fn() }
    mockQueue.getJob.mockResolvedValue(found)

    await retryJob("9")
    await removeJob("9")

    expect(found.retry).toHaveBeenCalledTimes(1)
    expect(found.remove).toHaveBeenCalledTimes(1)
  })

  it("throws for a job it cannot find", async () => {
    mockQueue.getJob.mockResolvedValue(undefined)

    await expect(retryJob("404")).rejects.toThrow("Job 404 not found")
    await expect(removeJob("404")).rejects.toThrow("Job 404 not found")
  })
})

describe("removeDeduplicatedJob", () => {
  it("removes the waiting job and frees its id", async () => {
    mockQueue.getDeduplicationJobId.mockResolvedValue("job-3")
    mockQueue.remove.mockResolvedValue(1)

    await expect(removeDeduplicatedJob("rewind:u1")).resolves.toBe(true)
    expect(mockQueue.remove).toHaveBeenCalledWith("job-3")
    expect(mockQueue.removeDeduplicationKey).toHaveBeenCalledWith("rewind:u1")
  })

  it("leaves a running job and its id alone", async () => {
    mockQueue.getDeduplicationJobId.mockResolvedValue("job-3")
    mockQueue.remove.mockResolvedValue(0)

    await expect(removeDeduplicatedJob("rewind:u1")).resolves.toBe(false)
    expect(mockQueue.removeDeduplicationKey).not.toHaveBeenCalled()
  })

  it("answers false when no job holds the id", async () => {
    mockQueue.getDeduplicationJobId.mockResolvedValue(null)

    await expect(removeDeduplicatedJob("rewind:u1")).resolves.toBe(false)
    expect(mockQueue.remove).not.toHaveBeenCalled()
  })
})

describe("schedulers", () => {
  it("upserts an interval and a cron scheduler under their ids", async () => {
    await scheduleRepeatingJob("watchlist", JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "scheduled" }, 60_000)
    await scheduleCronJob("nightly", JOB_TYPES.WATCHLIST_SYNC_ALL, { triggeredBy: "scheduled" }, { pattern: "0 3 * * *", tz: "Europe/London" })

    expect(mockQueue.upsertJobScheduler).toHaveBeenNthCalledWith(
      1,
      "watchlist",
      { every: 60_000 },
      { name: JOB_TYPES.WATCHLIST_SYNC_ALL, data: { triggeredBy: "scheduled" }, opts: undefined }
    )
    expect(mockQueue.upsertJobScheduler).toHaveBeenNthCalledWith(
      2,
      "nightly",
      { pattern: "0 3 * * *", tz: "Europe/London" },
      { name: JOB_TYPES.WATCHLIST_SYNC_ALL, data: { triggeredBy: "scheduled" }, opts: undefined }
    )
  })

  it("lists and removes schedulers", async () => {
    mockQueue.getJobSchedulers.mockResolvedValue([{ key: "watchlist" }])
    mockQueue.removeJobScheduler.mockResolvedValue(true)

    await expect(getJobSchedulers()).resolves.toEqual([{ key: "watchlist" }])
    await expect(removeScheduledJob("watchlist")).resolves.toBe(true)
  })
})

describe("pause, resume and close", () => {
  it("pauses and resumes the queue", async () => {
    await pauseQueue()
    await resumeQueue()

    expect(mockQueue.pause).toHaveBeenCalledTimes(1)
    expect(mockQueue.resume).toHaveBeenCalledTimes(1)
  })

  it("closes the queue, and builds a new one on the next use", async () => {
    await isQueuePaused()
    jest.mocked(Queue).mockClear()

    await closeQueue()
    expect(mockQueue.close).toHaveBeenCalledTimes(1)

    await closeQueue()
    expect(mockQueue.close).toHaveBeenCalledTimes(1)

    await isQueuePaused()
    expect(Queue).toHaveBeenCalledTimes(1)
  })
})
