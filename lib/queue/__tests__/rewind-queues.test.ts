/**
 * @jest-environment node
 */

import type { Job } from "bullmq"

import { onShutdown } from "@/lib/instrumentation/shutdown"
import { startWorker, stopWorker } from "@/lib/queue/worker"

type Processor = (job: Job) => Promise<unknown>

const mockWorkers: Array<{
  name: string
  processor: Processor
  options: Record<string, unknown>
  close: jest.Mock
}> = []

jest.mock("bullmq", () => ({
  Worker: jest.fn().mockImplementation((name: string, processor: Processor, options: Record<string, unknown>) => {
    const worker = { name, processor, options, close: jest.fn(async () => {}), on: jest.fn(), closing: undefined }
    mockWorkers.push(worker)
    return worker
  }),
}))
jest.mock("@/lib/queue/connection", () => ({
  getRedisConnection: jest.fn(() => ({ fake: "redis" })),
  closeWorker: jest.fn((worker: { close: () => Promise<void> }) => worker.close()),
}))
jest.mock("@/lib/queue/client", () => ({ QUEUE_NAME: "plex-wrapped" }))
jest.mock("@/lib/queue/jobs", () => ({ getJobProcessor: jest.fn(), getRegisteredJobTypes: jest.fn(() => []) }))
jest.mock("@/lib/instrumentation/shutdown", () => ({ onShutdown: jest.fn() }))
jest.mock("@/lib/queue/jobs/rewind", () => ({ processRewindGenerateUser: jest.fn(async () => "generated") }))
jest.mock("@/lib/queue/jobs/rewind-stale-sweep", () => ({ processRewindStaleSweep: jest.fn(async () => "swept") }))
jest.mock("@/lib/rewind/season-runs", () => ({ scheduleSeasonOpenRun: jest.fn(async () => null), scheduleFinalCutRun: jest.fn(async () => null) }))
jest.mock("@/lib/queue/jobs/rewind-final-cut", () => ({ processRewindFinalCut: jest.fn() }))
jest.mock("@/lib/queue/jobs/rewind-season", () => ({ REWIND_SEASON_PROCESSORS: {} }))
const mockUpsertJobScheduler = jest.fn(async () => ({}))
jest.mock("@/lib/queue/rewind-producers", () => ({
  getRewindQueue: jest.fn(() => ({ upsertJobScheduler: mockUpsertJobScheduler })),
}))

describe("Rewind queues", () => {
  afterEach(async () => {
    await stopWorker()
    mockWorkers.length = 0
    jest.mocked(onShutdown).mockClear()
  })

  it("starts the three Rewind Workers beside plex-wrapped, once", async () => {
    await startWorker()
    await startWorker()

    expect(mockWorkers.map((w) => w.name)).toEqual(["plex-wrapped", "rewind-batch", "rewind-gen", "rewind-aux"])
  })

  it("gives each Rewind Worker its concurrency, lock and retention settings", async () => {
    await startWorker()
    const rewind = mockWorkers.filter((w) => w.name.startsWith("rewind-"))

    expect(Object.fromEntries(rewind.map((w) => [w.name, w.options.concurrency]))).toEqual({
      "rewind-batch": 1,
      "rewind-gen": 4,
      "rewind-aux": 2,
    })
    for (const worker of rewind) {
      expect(worker.options).toMatchObject({
        lockDuration: 60_000,
        maxStalledCount: 1,
        removeOnComplete: { age: 86_400 },
        removeOnFail: { age: 604_800 },
      })
    }
  })

  it("registers the Rewind Workers to drain on shutdown, closing each", async () => {
    await startWorker()

    expect(onShutdown).toHaveBeenCalledTimes(1)
    const [name, phase, drain] = jest.mocked(onShutdown).mock.calls[0]
    expect([name, phase]).toEqual(["rewind-workers", "drain"])

    const rewind = mockWorkers.filter((w) => w.name.startsWith("rewind-"))
    await drain()
    rewind.forEach((w) => expect(w.close).toHaveBeenCalledTimes(1))
  })

  it("routes generation to rewind-gen and the stale sweep to rewind-aux", async () => {
    await startWorker()
    const gen = mockWorkers.find((w) => w.name === "rewind-gen")!
    const aux = mockWorkers.find((w) => w.name === "rewind-aux")!

    await expect(gen.processor({ name: "rewind:generate:user" } as Job)).resolves.toBe("generated")
    await expect(aux.processor({ name: "rewind:stale:sweep" } as Job)).resolves.toBe("swept")
    await expect(gen.processor({ name: "rewind:stale:sweep" } as Job)).rejects.toThrow("Unknown job type")
  })

  it("schedules the stale sweep every 10 minutes", async () => {
    await startWorker()

    expect(mockUpsertJobScheduler).toHaveBeenCalledWith(
      "rewind-stale-sweep",
      { every: 600_000 },
      { name: "rewind:stale:sweep", data: {}, opts: { attempts: 1 } }
    )
  })

  it("fails a job with no registered processor", async () => {
    await startWorker()
    const gen = mockWorkers.find((w) => w.name === "rewind-gen")!

    await expect(gen.processor({ name: "rewind:nope" } as Job)).rejects.toThrow(
      "Unknown job type on rewind-gen: rewind:nope"
    )
  })
})
