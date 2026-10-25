/**
 * @jest-environment node
 */

/**
 * The `plex-wrapped` Worker (P11.22): it starts once with the configured
 * concurrency, runs each job through its registered processor, fails an
 * unknown job type with a log line, counts every failure for /api/metrics
 * (P11.4's `onJobFailed`), and stops with the Rewind Workers.
 */

import { Worker, type Job } from "bullmq"

import { onJobFailed } from "@/lib/observability/job-failures"
import { closeWorker } from "@/lib/queue/connection"
import { getJobProcessor } from "@/lib/queue/jobs"
import { startRewindWorkers, stopRewindWorkers } from "@/lib/queue/rewind-queues"
import { startWorker, stopWorker } from "@/lib/queue/worker"
import { createLogger } from "@/lib/utils/logger"

type Handler = (...args: unknown[]) => void

const mockHandlers = new Map<string, Handler>()
const mockWorker = {
  on: jest.fn((event: string, handler: Handler) => mockHandlers.set(event, handler)),
  close: jest.fn(async () => {}),
}

jest.mock("bullmq", () => ({ Worker: jest.fn(() => mockWorker) }))
jest.mock("@/lib/queue/connection", () => ({
  getRedisConnection: jest.fn(() => ({ connection: "shared" })),
  closeWorker: jest.fn(async () => {}),
}))
jest.mock("@/lib/queue/jobs", () => ({
  getJobProcessor: jest.fn(),
  getRegisteredJobTypes: jest.fn(() => ["watchlist:sync:all"]),
}))
jest.mock("@/lib/queue/rewind-queues", () => ({ startRewindWorkers: jest.fn(), stopRewindWorkers: jest.fn(async () => {}) }))
jest.mock("@/lib/observability/job-failures", () => ({ onJobFailed: jest.fn() }))

jest.mock("@/lib/utils/logger", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})
const mockLogger = createLogger("QUEUE_WORKER")

const originalEnv = process.env

function job(name: string, extra: Partial<Job> = {}): Job {
  return { id: "j1", name, data: {}, attemptsMade: 0, opts: { attempts: 3 }, ...extra } as Job
}

/** The processor function the Worker was built with. */
function processor(): (job: Job) => Promise<unknown> {
  return jest.mocked(Worker).mock.calls[0][1] as (job: Job) => Promise<unknown>
}

beforeEach(async () => {
  await stopWorker()
  jest.clearAllMocks()
  mockHandlers.clear()
  process.env = { ...originalEnv }
  delete process.env.QUEUE_WORKER_CONCURRENCY
})

afterAll(() => {
  process.env = originalEnv
})

describe("startWorker", () => {
  it("starts one Worker with the default concurrency, and the Rewind Workers beside it", async () => {
    await startWorker()
    await startWorker()

    expect(Worker).toHaveBeenCalledTimes(1)
    expect(Worker).toHaveBeenCalledWith(
      "plex-wrapped",
      expect.any(Function),
      expect.objectContaining({ connection: { connection: "shared" }, concurrency: 5 })
    )
    expect(startRewindWorkers).toHaveBeenCalledTimes(1)
  })

  it.each([
    ["8", 8],
    ["0", 5],
    ["many", 5],
  ])("reads QUEUE_WORKER_CONCURRENCY=%p as %p", async (value, expected) => {
    process.env.QUEUE_WORKER_CONCURRENCY = value

    await startWorker()

    expect(jest.mocked(Worker).mock.calls[0][2]).toEqual(expect.objectContaining({ concurrency: expected }))
  })
})

describe("processing a job", () => {
  it("runs the registered processor and returns its result", async () => {
    const run = jest.fn(async () => ({ success: true, synced: 4 }))
    jest.mocked(getJobProcessor).mockReturnValue(run)
    await startWorker()

    await expect(processor()(job("watchlist:sync:all"))).resolves.toEqual({ success: true, synced: 4 })
    expect(run).toHaveBeenCalledTimes(1)
  })

  it("fails an unknown job type with a log line", async () => {
    jest.mocked(getJobProcessor).mockReturnValue(null)
    await startWorker()

    await expect(processor()(job("nope"))).rejects.toThrow("Unknown job type: nope")
    expect(mockLogger.error).toHaveBeenCalledWith("No processor found for job type", undefined, { jobType: "nope", jobId: "j1" })
  })

  it("logs and rethrows a processor's error", async () => {
    jest.mocked(getJobProcessor).mockReturnValue(jest.fn(async () => Promise.reject(new Error("upstream down"))))
    await startWorker()

    await expect(processor()(job("watchlist:sync:all"))).rejects.toThrow("upstream down")
    expect(mockLogger.error).toHaveBeenCalledWith(
      "Job processing failed",
      expect.any(Error),
      expect.objectContaining({ jobType: "watchlist:sync:all", attempt: 1, maxAttempts: 3 })
    )
  })
})

describe("events", () => {
  beforeEach(async () => {
    await startWorker()
  })

  it("counts a failed job and says whether it will retry", () => {
    const failed = job("watchlist:sync:all", { attemptsMade: 1 })
    const error = new Error("boom")

    mockHandlers.get("failed")!(failed, error)

    expect(onJobFailed).toHaveBeenCalledWith({ connection: "shared" }, "plex-wrapped", failed, error)
    expect(mockLogger.error).toHaveBeenCalledWith("Job failed", error, expect.objectContaining({ jobId: "j1", requestId: "job:j1", willRetry: true }))
  })

  it("counts a failure that has no job", () => {
    mockHandlers.get("failed")!(undefined, new Error("lost"))

    expect(onJobFailed).toHaveBeenCalledWith({ connection: "shared" }, "plex-wrapped", undefined, expect.any(Error))
    expect(mockLogger.error).toHaveBeenCalledWith("Job failed", expect.any(Error), expect.objectContaining({ jobId: undefined, requestId: undefined }))
  })

  it("logs a completed job's result as counts and flags only", () => {
    mockHandlers.get("completed")!(job("watchlist:sync:all"), { success: true, synced: 3, note: "long text", nested: {} })

    expect(mockLogger.info).toHaveBeenCalledWith(
      "Job completed",
      expect.objectContaining({ result: { success: true, synced: 3 } })
    )
  })

  it.each([
    [null, null],
    [undefined, undefined],
    ["done", "done"],
    [{ synced: 2, skipped: false, label: "x" }, { synced: 2, skipped: false }],
  ])("summarises the result %p as %p", (result, summary) => {
    mockHandlers.get("completed")!(job("watchlist:sync:all"), result)

    expect(mockLogger.info).toHaveBeenCalledWith("Job completed", expect.objectContaining({ result: summary }))
  })

  it("logs worker errors, stalls and starts", () => {
    mockHandlers.get("error")!(new Error("redis"))
    mockHandlers.get("stalled")!("j9")
    mockHandlers.get("active")!(job("watchlist:sync:all"))

    expect(mockLogger.error).toHaveBeenCalledWith("Worker error", expect.any(Error))
    expect(mockLogger.warn).toHaveBeenCalledWith("Job stalled", { jobId: "j9" })
    expect(mockLogger.debug).toHaveBeenCalledWith("Job started", { jobId: "j1", jobType: "watchlist:sync:all" })
  })
})

describe("stopWorker", () => {
  it("stops the Rewind Workers even when this one never started", async () => {
    await stopWorker()

    expect(stopRewindWorkers).toHaveBeenCalledTimes(1)
    expect(closeWorker).not.toHaveBeenCalled()
  })

  it("closes the Worker, so the next start builds a new one", async () => {
    await startWorker()
    await stopWorker()
    await startWorker()

    expect(closeWorker).toHaveBeenCalledWith(mockWorker)
    expect(Worker).toHaveBeenCalledTimes(2)
  })

  it("forces the close when the graceful one fails", async () => {
    await startWorker()
    jest.mocked(closeWorker).mockRejectedValueOnce(new Error("hung"))

    await stopWorker()

    expect(mockWorker.close).toHaveBeenCalledWith(true)
    expect(mockLogger.error).toHaveBeenCalledWith("Error stopping worker", expect.any(Error))
  })
})
