/**
 * @jest-environment node
 *
 * The nightly review sweep's schedule: 03:17 in the server zone while the
 * nightly review is on, removed while it is off.
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
jest.mock("@/lib/queue/client", () => ({ scheduleCronJob: jest.fn(), removeScheduledJob: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { removeScheduledJob, scheduleCronJob } from "@/lib/queue/client"

import { ensureJudgeSchedule } from "../schedule"

const config = (patch: Record<string, unknown> = {}) =>
  prismaMock.config.findUnique.mockResolvedValue({ judgeNightlyEnabled: true, timezone: "America/Chicago", ...patch } as never)

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  process.env.REDIS_URL = "redis://localhost:6379"
  config()
})
afterAll(() => {
  delete process.env.REDIS_URL
})

describe("ensureJudgeSchedule", () => {
  it("schedule upserts when on, removes when off, no-redis without REDIS_URL", async () => {
    await expect(ensureJudgeSchedule()).resolves.toEqual({ ok: true, state: "scheduled" })
    expect(scheduleCronJob).toHaveBeenCalledWith(
      "judge-review-sweep",
      "judge:sweep",
      { triggeredBy: "scheduled" },
      { pattern: "17 3 * * *", tz: "America/Chicago" },
      { attempts: 1 }
    )
    expect(removeScheduledJob).not.toHaveBeenCalled()

    jest.clearAllMocks()
    config({ judgeNightlyEnabled: false })
    await expect(ensureJudgeSchedule()).resolves.toEqual({ ok: true, state: "removed" })
    expect(removeScheduledJob).toHaveBeenCalledWith("judge-review-sweep")
    expect(scheduleCronJob).not.toHaveBeenCalled()

    jest.clearAllMocks()
    delete process.env.REDIS_URL
    await expect(ensureJudgeSchedule()).resolves.toEqual({ ok: true, state: "no-redis" })
    expect(scheduleCronJob).not.toHaveBeenCalled()
    expect(removeScheduledJob).not.toHaveBeenCalled()
  })

  it("falls back to TZ, then UTC, without a server zone", async () => {
    config({ timezone: null })
    const tz = process.env.TZ
    delete process.env.TZ
    try {
      await ensureJudgeSchedule()
    } finally {
      if (tz !== undefined) process.env.TZ = tz
    }
    expect(jest.mocked(scheduleCronJob).mock.calls[0]![3]).toEqual({ pattern: "17 3 * * *", tz: "UTC" })
  })

  it("removes the schedule without a Config row", async () => {
    prismaMock.config.findUnique.mockResolvedValue(null)
    await expect(ensureJudgeSchedule()).resolves.toEqual({ ok: true, state: "removed" })
  })

  it("reports a queue failure instead of throwing", async () => {
    jest.mocked(scheduleCronJob).mockRejectedValueOnce(new Error("redis down"))
    await expect(ensureJudgeSchedule()).resolves.toEqual({ ok: false, code: "FAILED" })
  })
})
