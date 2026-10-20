/**
 * @jest-environment node
 */

import { closeWorker, getRedisConnection } from "@/lib/queue/connection"

// BullMQ's graceful close hangs while the shared connection reconnects, so
// shutdown forces it then (the image smoke test's Redis outage).

const mockClient = { status: "ready", on: jest.fn() }
jest.mock("ioredis", () => ({ __esModule: true, default: jest.fn(() => mockClient) }))
jest.mock("@/lib/instrumentation/shutdown", () => ({ onShutdown: jest.fn() }))

const originalEnv = process.env

beforeAll(() => {
  process.env = { ...originalEnv, REDIS_URL: "redis://localhost:6390" }
})

afterAll(() => {
  process.env = originalEnv
})

describe("closeWorker()", () => {
  const worker = { close: jest.fn(async () => {}) }

  beforeEach(() => worker.close.mockClear())

  it("closes gracefully while the shared connection is ready", async () => {
    getRedisConnection()
    mockClient.status = "ready"

    await closeWorker(worker)

    expect(worker.close).toHaveBeenCalledWith(false)
  })

  it.each(["reconnecting", "connecting", "close", "end"])("forces the close while the connection is %s", async (status) => {
    getRedisConnection()
    mockClient.status = status

    await closeWorker(worker)

    expect(worker.close).toHaveBeenCalledWith(true)
  })
})
