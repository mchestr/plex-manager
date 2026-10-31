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
import { ensureMemberActivitySchedule, MEMBER_ACTIVITY_PATTERN, MEMBER_ACTIVITY_SCHEDULER_ID } from "@/lib/inactivity/schedule"
import { scheduleCronJob } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"

const originalEnv = process.env

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  process.env = { ...originalEnv, REDIS_URL: "redis://localhost:6379", TZ: "UTC" }
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ timezone: "America/Chicago" }))
})

afterAll(() => {
  process.env = originalEnv
})

describe("ensureMemberActivitySchedule", () => {
  it("schedules the run daily at 02:17 in the server zone, with one attempt", async () => {
    await expect(ensureMemberActivitySchedule()).resolves.toEqual({ ok: true, state: "scheduled" })
    expect(scheduleCronJob).toHaveBeenCalledWith(
      MEMBER_ACTIVITY_SCHEDULER_ID,
      JOB_TYPES.MEMBER_ACTIVITY,
      { triggeredBy: "scheduled" },
      { pattern: MEMBER_ACTIVITY_PATTERN, tz: "America/Chicago" },
      { attempts: 1 }
    )
    expect([MEMBER_ACTIVITY_SCHEDULER_ID, MEMBER_ACTIVITY_PATTERN]).toEqual(["member-activity", "17 2 * * *"])
  })

  it("falls back to TZ, then UTC", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)
    process.env.TZ = "Europe/Berlin"
    await ensureMemberActivitySchedule()

    delete process.env.TZ
    await ensureMemberActivitySchedule()

    expect(jest.mocked(scheduleCronJob).mock.calls.map((call) => call[3].tz)).toEqual(["Europe/Berlin", "UTC"])
  })

  it("does nothing without Redis", async () => {
    delete process.env.REDIS_URL
    await expect(ensureMemberActivitySchedule()).resolves.toEqual({ ok: true, state: "no-redis" })
    expect(scheduleCronJob).not.toHaveBeenCalled()
  })

  it("reports a queue failure instead of throwing", async () => {
    jest.mocked(scheduleCronJob).mockRejectedValueOnce(new Error("redis down"))
    await expect(ensureMemberActivitySchedule()).resolves.toEqual({ ok: false, code: "FAILED" })
  })

  it("reports a queue that does not answer in time", async () => {
    jest.useFakeTimers()
    try {
      jest.mocked(scheduleCronJob).mockReturnValueOnce(new Promise(() => {}))
      const result = ensureMemberActivitySchedule()
      await jest.advanceTimersByTimeAsync(5000)
      await expect(result).resolves.toEqual({ ok: false, code: "TIMEOUT" })
    } finally {
      jest.useRealTimers()
    }
  })
})
