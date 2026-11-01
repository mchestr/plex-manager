/**
 * @jest-environment node
 */

import { closeWorker } from "@/lib/queue/close-worker"
import { createLogger } from "@/lib/utils/logger"

// BullMQ's graceful close waits on both of the Worker's connections, the
// shared one and its own blocking duplicate, and can hang while either one
// reconnects, so shutdown forces it then (the image smoke test's stop after
// its Redis outage).

jest.mock("@/lib/utils/logger", () => {
  const logger = { debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }
  return { createLogger: () => logger }
})
const mockLogger = createLogger("QUEUE_WORKER")

type ConnectionState = { connection: string; client?: string }

/** A client promise that settles, like BullMQ's, only once its connection first connected. */
function clientOf({ client }: ConnectionState) {
  return client === undefined ? new Promise<never>(() => {}) : Promise.resolve({ status: client })
}

/** A Worker whose connections have these BullMQ statuses and client statuses. */
function workerWith(shared: ConnectionState, blocking: ConnectionState) {
  return {
    name: "rewind-gen",
    close: jest.fn(async () => {}),
    getBackend: () => ({
      connection: { status: shared.connection },
      client: clientOf(shared),
      blockingConnection: { status: blocking.connection },
      blockingClient: clientOf(blocking),
    }),
  }
}

const READY = { connection: "ready", client: "ready" }

beforeEach(() => {
  jest.clearAllMocks()
})

describe("closeWorker()", () => {
  it("closes gracefully while both of the Worker's connections are ready", async () => {
    const worker = workerWith(READY, READY)

    await closeWorker(worker)

    expect(worker.close).toHaveBeenCalledWith(false)
    expect(mockLogger.info).not.toHaveBeenCalled()
  })

  it.each(["reconnecting", "connecting", "close", "end"])("forces the close while the shared connection is %s", async (status) => {
    const worker = workerWith({ connection: "ready", client: status }, READY)

    await closeWorker(worker)

    expect(worker.close).toHaveBeenCalledWith(true)
  })

  it.each(["reconnecting", "connecting", "connect", "end"])(
    "forces the close while the Worker's blocking connection is %s, though the shared one is ready",
    async (status) => {
      const worker = workerWith(READY, { connection: "ready", client: status })

      await closeWorker(worker)

      expect(worker.close).toHaveBeenCalledWith(true)
      expect(mockLogger.info).toHaveBeenCalledWith(
        "Closing a queue worker without waiting for its jobs: Redis is not connected",
        { queue: "rewind-gen", shared: "ready", blocking: status }
      )
    }
  )

  it.each(["initializing", "closing", "closed"])(
    "forces the close, without waiting on its client, while a connection is %s",
    async (status) => {
      const blockingNeverConnected = workerWith(READY, { connection: status })
      const sharedNeverConnected = workerWith({ connection: status }, READY)

      await closeWorker(blockingNeverConnected)
      await closeWorker(sharedNeverConnected)

      expect(blockingNeverConnected.close).toHaveBeenCalledWith(true)
      expect(sharedNeverConnected.close).toHaveBeenCalledWith(true)
    }
  )
})
