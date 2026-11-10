/**
 * @jest-environment node
 *
 * PROBLEM_REPORT_UPDATE: one member's DM about a report that was fixed or
 * closed, between 09:00 and 20:00 in their zone, skipped when the report
 * changed again, the bot is off or they have no Discord, and not retried on
 * closed DMs.
 */

import { DelayedError, type Job } from "bullmq"
import { mockReset } from "jest-mock-extended"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { DiscordApiError, DISCORD_DMS_CLOSED, sendDiscordDirectMessage } from "@/lib/discord/api"
import { isDiscordBotEnabled } from "@/lib/discord/config"
import { getProblemReportUpdateProcessor, processProblemReportUpdate } from "@/lib/queue/jobs/problem-report-update"
import { JOB_TYPES } from "@/lib/queue/types"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/discord/config", () => ({ isDiscordBotEnabled: jest.fn() }))
jest.mock("@/lib/discord/api", () => ({ ...jest.requireActual("@/lib/discord/api"), sendDiscordDirectMessage: jest.fn() }))
jest.mock("@/lib/env", () => ({ getBaseUrl: () => "https://plex.example.com" }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: async () => "UTC" }))

const DAY = new Date("2026-11-09T15:00:00Z")
const NIGHT = new Date("2026-11-09T23:00:00Z")
const moveToDelayed = jest.fn(async () => undefined)
const job = (data: { reportId: string; userId: string; status: "FIXED" | "CLOSED" } = { reportId: "report-1", userId: "member-1", status: "FIXED" }) =>
  ({ data, moveToDelayed }) as unknown as Job<{ reportId: string; userId: string; status: "FIXED" | "CLOSED" }>
const REPORT = {
  status: "FIXED",
  reporterId: "member-1",
  memberNote: null,
  title: "The Office",
  year: 2005,
  showTitle: null,
  seasonNumber: null,
  episodeNumber: null,
  events: [{ kind: "FIXED", data: { reason: "fix", action: "LOOK_FOR_MISSING" } }],
}

beforeEach(() => {
  mockReset(prismaMock)
  jest.clearAllMocks()
  jest.useFakeTimers({ now: DAY, doNotFake: ["setTimeout", "clearTimeout", "setImmediate", "nextTick", "queueMicrotask"] })
  prismaMock.problemReport.findUnique.mockResolvedValue(REPORT as never)
  prismaMock.user.findUnique.mockResolvedValue({ timezone: null, disabledAt: null, discordConnection: { discordUserId: "discord-1", revokedAt: null } } as never)
  jest.mocked(isDiscordBotEnabled).mockResolvedValue(true)
  jest.mocked(sendDiscordDirectMessage).mockResolvedValue(undefined)
})

afterEach(() => jest.useRealTimers())

describe("processProblemReportUpdate", () => {
  it("tells the member the missing episodes are on the server now, with a link to their reports", async () => {
    await expect(processProblemReportUpdate(job())).resolves.toEqual({ sent: true })

    expect(sendDiscordDirectMessage).toHaveBeenCalledWith(
      "discord-1",
      "The Office \\(2005\\) has the missing episodes now.\nYour reports: <https://plex.example.com/report>",
      expect.any(AbortSignal)
    )
  })

  it("waits for the morning in the member's zone", async () => {
    jest.setSystemTime(NIGHT)

    await expect(processProblemReportUpdate(job(), "token")).rejects.toBeInstanceOf(DelayedError)
    expect(moveToDelayed).toHaveBeenCalledWith(new Date("2026-11-10T09:00:00Z").getTime(), "token")
    expect(sendDiscordDirectMessage).not.toHaveBeenCalled()
  })

  it("tells a follower the member who made it cancelled it", async () => {
    prismaMock.problemReport.findUnique.mockResolvedValue({ ...REPORT, status: "CLOSED", events: [{ kind: "CLOSED", data: { reason: "cancelled" } }] } as never)

    await processProblemReportUpdate(job({ reportId: "report-1", userId: "member-2", status: "CLOSED" }))
    expect(jest.mocked(sendDiscordDirectMessage).mock.calls[0][1]).toMatch(/^The report you follow about The Office \\\(2005\\\) was cancelled by the member who made it\./)
  })

  it.each([
    ["the report changed again", () => prismaMock.problemReport.findUnique.mockResolvedValue({ ...REPORT, status: "WITH_ADMIN" } as never), "CHANGED"],
    ["the bot is off", () => jest.mocked(isDiscordBotEnabled).mockResolvedValue(false), "BOT_DISABLED"],
    ["the member has no Discord", () => prismaMock.user.findUnique.mockResolvedValue({ timezone: null, disabledAt: null, discordConnection: null } as never), "NOT_LINKED"],
    ["their DMs are closed", () => jest.mocked(sendDiscordDirectMessage).mockRejectedValue(new DiscordApiError(403, DISCORD_DMS_CLOSED)), "DMS_CLOSED"],
  ])("skips the DM when %s", async (_label, arrange, reason) => {
    arrange()
    await expect(processProblemReportUpdate(job())).resolves.toEqual({ skipped: reason })
  })

  it("throws any other failure, so the job retries", async () => {
    const down = new Error("Discord is down")
    jest.mocked(sendDiscordDirectMessage).mockRejectedValue(down)

    await expect(processProblemReportUpdate(job())).rejects.toBe(down)
  })
})

describe("getProblemReportUpdateProcessor", () => {
  it("handles only the update job", () => {
    expect(getProblemReportUpdateProcessor(JOB_TYPES.PROBLEM_REPORT_UPDATE)).toBe(processProblemReportUpdate)
    expect(getProblemReportUpdateProcessor(JOB_TYPES.PROBLEM_REPORT_FIX)).toBeNull()
  })
})
