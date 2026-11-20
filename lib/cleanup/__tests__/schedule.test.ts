/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
jest.mock("@/lib/queue/client", () => ({ scheduleCronJob: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { buildConfig } from "@/__tests__/helpers/factories"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { COLLECTIONS_PATTERN, NIGHTLY_PATTERN } from "@/lib/cleanup/constants"
import { CLEANUP_COLLECTIONS_SCHEDULER_ID, CLEANUP_NIGHTLY_SCHEDULER_ID, ensureCleanupSchedule } from "@/lib/cleanup/schedule"
import { scheduleCronJob } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"

const originalEnv = process.env
const OPTIONS = { attempts: 1, removeOnComplete: true, removeOnFail: { age: 7 * 24 * 3600 } }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  process.env = { ...originalEnv, REDIS_URL: "redis://localhost:6379", TZ: "UTC" }
  delete process.env.E2E_TEST_MODE
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ timezone: "America/Chicago" }))
})

afterAll(() => {
  process.env = originalEnv
})

describe("ensureCleanupSchedule", () => {
  it("schedules the nightly read with its run at 03:07 and the collection sync hourly at minute 41, in the server zone", async () => {
    await expect(ensureCleanupSchedule()).resolves.toEqual({ ok: true, state: "scheduled" })

    expect(scheduleCronJob).toHaveBeenCalledTimes(2)
    expect(scheduleCronJob).toHaveBeenCalledWith(
      CLEANUP_NIGHTLY_SCHEDULER_ID,
      JOB_TYPES.CLEANUP_READ,
      { trigger: "scheduled", chain: true },
      { pattern: NIGHTLY_PATTERN, tz: "America/Chicago" },
      OPTIONS
    )
    expect(scheduleCronJob).toHaveBeenCalledWith(
      CLEANUP_COLLECTIONS_SCHEDULER_ID,
      JOB_TYPES.CLEANUP_COLLECTIONS,
      { reason: "scheduled" },
      { pattern: COLLECTIONS_PATTERN, tz: "America/Chicago" },
      OPTIONS
    )
    expect([CLEANUP_NIGHTLY_SCHEDULER_ID, CLEANUP_COLLECTIONS_SCHEDULER_ID, NIGHTLY_PATTERN, COLLECTIONS_PATTERN]).toEqual([
      "cleanup-nightly",
      "cleanup-collections",
      "7 3 * * *",
      "41 * * * *",
    ])
  })

  it("falls back to TZ, then UTC", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)
    process.env.TZ = "Europe/Berlin"
    await ensureCleanupSchedule()

    delete process.env.TZ
    await ensureCleanupSchedule()

    expect(jest.mocked(scheduleCronJob).mock.calls.map((call) => call[3].tz)).toEqual(["Europe/Berlin", "Europe/Berlin", "UTC", "UTC"])
  })

  it("does nothing without Redis", async () => {
    delete process.env.REDIS_URL
    await expect(ensureCleanupSchedule()).resolves.toEqual({ ok: true, state: "no-redis" })
    expect(scheduleCronJob).not.toHaveBeenCalled()
  })

  it("schedules nothing in an end-to-end run, so a page never depends on the clock", async () => {
    process.env.E2E_TEST_MODE = "true"
    await expect(ensureCleanupSchedule()).resolves.toEqual({ ok: true, state: "e2e" })
    expect(scheduleCronJob).not.toHaveBeenCalled()
    expect(prismaMock.config.findUnique).not.toHaveBeenCalled()
  })

  it("schedules when E2E_TEST_MODE holds another value", async () => {
    process.env.E2E_TEST_MODE = "false"
    await expect(ensureCleanupSchedule()).resolves.toEqual({ ok: true, state: "scheduled" })
  })

  it("reports a queue failure instead of throwing", async () => {
    jest.mocked(scheduleCronJob).mockRejectedValueOnce(new Error("redis down"))
    await expect(ensureCleanupSchedule()).resolves.toEqual({ ok: false, code: "FAILED" })
  })

  it("reports a settings read that fails instead of throwing", async () => {
    prismaMock.config.findUnique.mockRejectedValueOnce(new Error("database down"))
    await expect(ensureCleanupSchedule()).resolves.toEqual({ ok: false, code: "FAILED" })
    expect(scheduleCronJob).not.toHaveBeenCalled()
  })

  it("stops waiting after 5 s for a queue that does not answer", async () => {
    jest.useFakeTimers()
    try {
      jest.mocked(scheduleCronJob).mockReturnValueOnce(new Promise(() => {}))
      const result = ensureCleanupSchedule()
      await jest.advanceTimersByTimeAsync(4999)
      let settled = false
      void result.then(() => (settled = true))
      await jest.advanceTimersByTimeAsync(0)
      expect(settled).toBe(false)
      await jest.advanceTimersByTimeAsync(1)
      await expect(result).resolves.toEqual({ ok: false, code: "TIMEOUT" })
    } finally {
      jest.useRealTimers()
    }
  })
})
