/**
 * @jest-environment node
 */

/** `requestCollectionSync()` (TS 8.10): the dirty flag first, then the job; never a throw. */

const mockWarn = jest.fn()
const mockError = jest.fn()
const mockEnqueue = jest.fn()
const mockRedis = jest.fn(() => true)
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), warn: (...args: unknown[]) => mockWarn(...args), error: (...args: unknown[]) => mockError(...args) }),
}))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: () => mockRedis() }))
jest.mock("@/lib/queue/request-path", () => ({ enqueueFromRequest: (...args: unknown[]) => mockEnqueue(...args) }))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"

const NOW = new Date("2026-11-08T12:00:00.000Z")

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers({ now: NOW })
  mockRedis.mockReturnValue(true)
  mockEnqueue.mockResolvedValue({ ok: true, jobId: "cleanup:collections" })
})

afterEach(() => jest.useRealTimers())

it("sets collectionsDirtyAt before it enqueues the sync", async () => {
  const order: string[] = []
  prismaMock.cleanupSettings.upsert.mockImplementation((async () => order.push("flag")) as never)
  mockEnqueue.mockImplementation(async () => {
    order.push("enqueue")
    return { ok: true, jobId: "1" }
  })

  await expect(requestCollectionSync("approve")).resolves.toEqual({ flagged: true, queued: true })

  expect(order).toEqual(["flag", "enqueue"])
  expect(prismaMock.cleanupSettings.upsert).toHaveBeenCalledWith({
    where: { id: "cleanup" }, create: { id: "cleanup", collectionsDirtyAt: NOW }, update: { collectionsDirtyAt: NOW },
  })
  expect(mockEnqueue).toHaveBeenCalledWith("cleanup:collections", { reason: "change" }, { attempts: 1, removeOnComplete: true, removeOnFail: { age: 604800 } })
})

it("logs a queue failure and does not throw", async () => {
  mockEnqueue.mockResolvedValue({ ok: false, code: "QUEUE_UNAVAILABLE" })

  await expect(requestCollectionSync()).resolves.toEqual({ flagged: true, queued: false })

  expect(mockWarn).toHaveBeenCalledWith("cleanup.collections_enqueue_failed", { reason: "change", code: "QUEUE_UNAVAILABLE" })
})

it("logs a failed flag write and still enqueues", async () => {
  prismaMock.cleanupSettings.upsert.mockRejectedValue(new Error("db"))

  await expect(requestCollectionSync("act")).resolves.toEqual({ flagged: false, queued: true })

  expect(mockError).toHaveBeenCalledWith("cleanup.collections_flag_failed", expect.any(Error), { reason: "act" })
})

it("only sets the flag without REDIS_URL", async () => {
  mockRedis.mockReturnValue(false)

  await expect(requestCollectionSync()).resolves.toEqual({ flagged: true, queued: false })

  expect(mockEnqueue).not.toHaveBeenCalled()
})
