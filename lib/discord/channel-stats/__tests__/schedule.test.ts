/**
 * @jest-environment node
 */

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ debug: jest.fn(), info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
jest.mock("@/lib/queue/client", () => ({ scheduleRepeatingJob: jest.fn(), removeScheduledJob: jest.fn() }))

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { removeScheduledJob, scheduleRepeatingJob } from "@/lib/queue/client"

import { ensureChannelStatsSchedule } from "../schedule"

const config = (patch: Record<string, unknown> = {}) =>
  prismaMock.config.findUnique.mockResolvedValue({ discordStatsEnabled: true, discordStatsIntervalMinutes: 10, ...patch } as never)

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  process.env.REDIS_URL = "redis://localhost:6379"
  config()
})
afterAll(() => {
  delete process.env.REDIS_URL
})

describe("ensureChannelStatsSchedule", () => {
  it("repeats at the admin's interval", async () => {
    config({ discordStatsIntervalMinutes: 15 })
    await expect(ensureChannelStatsSchedule()).resolves.toEqual({ ok: true, state: "scheduled" })
    expect(scheduleRepeatingJob).toHaveBeenCalledWith("discord-channel-stats", "discord:channel-stats", { triggeredBy: "scheduled" }, 900_000, { attempts: 1 })
  })

  it("never goes under ten minutes, which Discord's rename limit needs", async () => {
    config({ discordStatsIntervalMinutes: 1 })
    await ensureChannelStatsSchedule()
    expect(jest.mocked(scheduleRepeatingJob).mock.calls[0]![3]).toBe(600_000)
  })

  it("removes the schedule while off", async () => {
    config({ discordStatsEnabled: false })
    await expect(ensureChannelStatsSchedule()).resolves.toEqual({ ok: true, state: "removed" })
    expect(removeScheduledJob).toHaveBeenCalledWith("discord-channel-stats")
  })

  it("does nothing without Redis", async () => {
    delete process.env.REDIS_URL
    await expect(ensureChannelStatsSchedule()).resolves.toEqual({ ok: true, state: "no-redis" })
  })

  it("reports a queue failure instead of throwing", async () => {
    jest.mocked(scheduleRepeatingJob).mockRejectedValueOnce(new Error("redis down"))
    await expect(ensureChannelStatsSchedule()).resolves.toEqual({ ok: false, code: "FAILED" })
  })
})
