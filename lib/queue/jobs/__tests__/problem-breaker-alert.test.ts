/**
 * @jest-environment node
 *
 * PROBLEM_BREAKER_ALERT: the admins' DM when the breaker trips, skipped once
 * fixes resumed, while the bot is off or with no linked admin; an admin with
 * closed DMs is skipped, and a send that reached no one else throws to retry.
 */

import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { DiscordApiError, DISCORD_DMS_CLOSED, sendDiscordDirectMessage } from "@/lib/discord/api"
import { isDiscordBotEnabled } from "@/lib/discord/config"
import { getProblemBreakerAlertProcessor, processProblemBreakerAlert } from "@/lib/queue/jobs/problem-breaker-alert"
import { JOB_TYPES } from "@/lib/queue/types"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/discord/config", () => ({ isDiscordBotEnabled: jest.fn() }))
jest.mock("@/lib/discord/api", () => ({ ...jest.requireActual("@/lib/discord/api"), sendDiscordDirectMessage: jest.fn() }))
jest.mock("@/lib/env", () => ({ getBaseUrl: () => "https://plex.example.com" }))

const JOB = { data: { trippedAt: "2026-11-09T20:00:00.000Z" } }
const admin = (id: string) => ({ id, discordConnection: { discordUserId: `discord-${id}` } })

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  prismaMock.problemReportSettings.findUnique.mockResolvedValue({ breakerTrippedAt: new Date() } as never)
  prismaMock.user.findMany.mockResolvedValue([admin("a1"), admin("a2")] as never)
  jest.mocked(isDiscordBotEnabled).mockResolvedValue(true)
  jest.mocked(sendDiscordDirectMessage).mockResolvedValue(undefined)
})

describe("processProblemBreakerAlert", () => {
  it("tells each linked admin that fixes are paused, with a link to resume them", async () => {
    await expect(processProblemBreakerAlert(JOB)).resolves.toEqual({ sent: 2 })

    expect(sendDiscordDirectMessage).toHaveBeenCalledWith("discord-a1", expect.stringMatching(/^Fixes that replace files are paused.*<https:\/\/plex\.example\.com\/admin\/problem-reports>$/), expect.any(AbortSignal))
  })

  it.each([
    ["an admin resumed fixes", () => prismaMock.problemReportSettings.findUnique.mockResolvedValue({ breakerTrippedAt: null } as never), "RESUMED"],
    ["the bot is off", () => jest.mocked(isDiscordBotEnabled).mockResolvedValue(false), "BOT_DISABLED"],
    ["no admin linked Discord", () => prismaMock.user.findMany.mockResolvedValue([{ id: "a1", discordConnection: null }] as never), "NO_ADMINS"],
    ["every admin's DMs are closed", () => jest.mocked(sendDiscordDirectMessage).mockRejectedValue(new DiscordApiError(403, DISCORD_DMS_CLOSED)), "DMS_CLOSED"],
  ])("is skipped when %s", async (_label, arrange, reason) => {
    arrange()

    await expect(processProblemBreakerAlert(JOB)).resolves.toEqual({ skipped: reason })
  })

  it("throws to retry when a send reached nobody, and keeps going past one admin it couldn't reach", async () => {
    jest.mocked(sendDiscordDirectMessage).mockRejectedValue(new Error("Discord is down"))
    await expect(processProblemBreakerAlert(JOB)).rejects.toThrow("Discord is down")

    jest.mocked(sendDiscordDirectMessage).mockRejectedValueOnce(new Error("Discord is down")).mockResolvedValueOnce(undefined)
    await expect(processProblemBreakerAlert(JOB)).resolves.toEqual({ sent: 1 })
  })

  it("is the processor for its job type only", () => {
    expect(getProblemBreakerAlertProcessor(JOB_TYPES.PROBLEM_BREAKER_ALERT)).toBe(processProblemBreakerAlert)
    expect(getProblemBreakerAlertProcessor(JOB_TYPES.PROBLEM_REPORT_FIX)).toBeNull()
  })
})
