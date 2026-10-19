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
jest.mock("@/lib/queue/connection", () => ({ getRedisConnection: jest.fn(() => ({ fake: "redis" })) }))
jest.mock("@/lib/queue/client", () => ({ QUEUE_NAME: "plex-wrapped" }))
jest.mock("@/lib/queue/jobs", () => ({ getJobProcessor: jest.fn(), getRegisteredJobTypes: jest.fn(() => []) }))
jest.mock("@/lib/instrumentation/shutdown", () => ({ onShutdown: jest.fn() }))

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

  it("fails a job with no registered processor", async () => {
    await startWorker()
    const gen = mockWorkers.find((w) => w.name === "rewind-gen")!

    await expect(gen.processor({ name: "rewind:nope" } as Job)).rejects.toThrow(
      "Unknown job type on rewind-gen: rewind:nope"
    )
  })
})
