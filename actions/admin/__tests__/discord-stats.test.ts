/**
 * @jest-environment node
 *
 * The Discord stat channels actions: settings save (needs a bot token, audited,
 * schedule moved) and "Update now".
 */

import { getServerSession } from "next-auth"
import { mockReset } from "jest-mock-extended"

import { runChannelStatsNow, updateChannelStatsSettings } from "@/actions/admin/discord-stats"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { DEFAULT_FORMATS } from "@/lib/discord/channel-stats/format"
import { runChannelStats } from "@/lib/discord/channel-stats/run"
import { ensureChannelStatsSchedule } from "@/lib/discord/channel-stats/schedule"
import { STAT_KEYS } from "@/lib/discord/channel-stats/stats"
import { getDiscordBotToken } from "@/lib/discord/config"
import { addJob } from "@/lib/queue/client"
import { isRedisConfigured } from "@/lib/queue/connection"
import { AuditEventType, logAuditEvent } from "@/lib/security/audit-log"
import { consume } from "@/lib/security/rate-limit"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }))
jest.mock("@/lib/security/rate-limit", () => ({ consume: jest.fn(), actionClientIp: jest.fn() }))
jest.mock("@/lib/discord/config", () => ({ getDiscordBotToken: jest.fn() }))
jest.mock("@/lib/discord/channel-stats/schedule", () => ({ ensureChannelStatsSchedule: jest.fn() }))
jest.mock("@/lib/discord/channel-stats/run", () => ({ runChannelStats: jest.fn() }))
jest.mock("@/lib/queue/client", () => ({ addJob: jest.fn() }))
jest.mock("@/lib/queue/connection", () => ({ isRedisConfigured: jest.fn() }))
jest.mock("@/lib/security/audit-log", () => ({ ...jest.requireActual("@/lib/security/audit-log"), logAuditEvent: jest.fn() }))

const channels = Object.fromEntries(STAT_KEYS.map((key) => [key, { channelId: "", format: DEFAULT_FORMATS[key] }])) as never
const settings = { enabled: true, intervalMinutes: 10, channels }

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.mocked(getServerSession).mockResolvedValue({ user: { id: "admin-1", isAdmin: true } })
  jest.mocked(consume).mockResolvedValue({ ok: true })
  jest.mocked(getDiscordBotToken).mockResolvedValue("token")
  jest.mocked(ensureChannelStatsSchedule).mockResolvedValue({ ok: true, state: "scheduled" })
  jest.mocked(isRedisConfigured).mockReturnValue(false)
  prismaMock.config.findUnique.mockResolvedValue(null)
  prismaMock.config.upsert.mockResolvedValue({} as never)
})

describe("updateChannelStatsSettings", () => {
  it("refuses a member", async () => {
    jest.mocked(getServerSession).mockResolvedValue({ user: { id: "m1", isAdmin: false } })
    await expect(updateChannelStatsSettings(settings)).resolves.toMatchObject({ success: false, code: "FORBIDDEN" })
  })

  it("saves, audits and moves the schedule", async () => {
    await expect(updateChannelStatsSettings(settings)).resolves.toEqual({ success: true, data: null })

    expect(prismaMock.config.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: { discordStatsEnabled: true, discordStatsIntervalMinutes: 10, discordStatsChannels: channels, updatedBy: "admin-1" },
      })
    )
    expect(logAuditEvent).toHaveBeenCalledWith(AuditEventType.CONFIG_CHANGED, "admin-1", expect.objectContaining({ section: "discord.stats" }))
    expect(ensureChannelStatsSchedule).toHaveBeenCalled()
  })

  it("keeps the interval at ten minutes or more", async () => {
    await expect(updateChannelStatsSettings({ ...settings, intervalMinutes: 5 })).resolves.toMatchObject({
      success: false,
      code: "VALIDATION",
      fieldErrors: { intervalMinutes: expect.any(Array) },
    })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it("refuses to turn on without a bot token", async () => {
    jest.mocked(getDiscordBotToken).mockResolvedValue(undefined)
    await expect(updateChannelStatsSettings(settings)).resolves.toMatchObject({ success: false, code: "VALIDATION" })
    expect(prismaMock.config.upsert).not.toHaveBeenCalled()
  })

  it("says so when the queue did not take the schedule", async () => {
    jest.mocked(ensureChannelStatsSchedule).mockResolvedValue({ ok: false, code: "FAILED" })
    await expect(updateChannelStatsSettings(settings)).resolves.toMatchObject({ success: false, code: "UPSTREAM_UNAVAILABLE" })
  })
})

describe("runChannelStatsNow", () => {
  it("queues the job with Redis", async () => {
    jest.mocked(isRedisConfigured).mockReturnValue(true)
    await expect(runChannelStatsNow()).resolves.toEqual({ success: true, data: { queued: true } })
    expect(addJob).toHaveBeenCalledWith("discord:channel-stats", { triggeredBy: "admin" }, expect.objectContaining({ attempts: 1 }))
  })

  it("runs it in the request without Redis", async () => {
    await expect(runChannelStatsNow()).resolves.toEqual({ success: true, data: { queued: false } })
    expect(runChannelStats).toHaveBeenCalledWith("admin", expect.anything())
  })
})
