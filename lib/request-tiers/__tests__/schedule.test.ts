/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
jest.mock("@/lib/queue/client", () => ({ scheduleCronJob: jest.fn(), removeScheduledJob: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { removeScheduledJob, scheduleCronJob } from "@/lib/queue/client"

import { ensureRequestTierSchedule } from "../schedule"

const config = (patch: Record<string, unknown> = {}) =>
  prismaMock.config.findUnique.mockResolvedValue({ requestTiersEnabled: true, requestTiersRunHour: 0, timezone: "America/Chicago", ...patch } as never)

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  process.env.REDIS_URL = "redis://localhost:6379"
  config()
})
afterAll(() => {
  delete process.env.REDIS_URL
})

describe("ensureRequestTierSchedule", () => {
  it("schedules a daily run at the chosen hour in the server zone", async () => {
    config({ requestTiersRunHour: 4 })
    await expect(ensureRequestTierSchedule()).resolves.toEqual({ ok: true, state: "scheduled" })
    expect(scheduleCronJob).toHaveBeenCalledWith(
      "request-tier-sync",
      "request-tiers:sync",
      { triggeredBy: "scheduled" },
      { pattern: "0 4 * * *", tz: "America/Chicago" },
      { attempts: 1 }
    )
  })

  it("runs at midnight by default", async () => {
    await ensureRequestTierSchedule()
    expect(jest.mocked(scheduleCronJob).mock.calls[0]![3]).toMatchObject({ pattern: "0 0 * * *" })
  })

  it("removes the schedule while the sync is off", async () => {
    config({ requestTiersEnabled: false })
    await expect(ensureRequestTierSchedule()).resolves.toEqual({ ok: true, state: "removed" })
    expect(removeScheduledJob).toHaveBeenCalledWith("request-tier-sync")
    expect(scheduleCronJob).not.toHaveBeenCalled()
  })

  it("does nothing without Redis", async () => {
    delete process.env.REDIS_URL
    await expect(ensureRequestTierSchedule()).resolves.toEqual({ ok: true, state: "no-redis" })
    expect(scheduleCronJob).not.toHaveBeenCalled()
  })

  it("reports a queue failure instead of throwing", async () => {
    jest.mocked(scheduleCronJob).mockRejectedValueOnce(new Error("redis down"))
    await expect(ensureRequestTierSchedule()).resolves.toEqual({ ok: false, code: "FAILED" })
  })
})
