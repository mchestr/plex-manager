/**
 * `getDiscordDashboardData` (P11.5, DUP-06): one admin check and one session
 * read per page load, the marked-media filters, and a failed figure that
 * blanks only itself.
 */

import { mockReset } from "jest-mock-extended"
import { getServerSession } from "next-auth"

import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { getDiscordDashboardData } from "@/lib/data/discord-activity"
import { getSummaryStats } from "@/lib/discord/audit"
import { prisma } from "@/lib/prisma"
import { auditMemberListed } from "@/lib/security/audit-log"

jest.mock("next-auth", () => ({ getServerSession: jest.fn() }))
jest.mock("@/lib/auth", () => ({ authOptions: {} }))
jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/security/audit-log", () => ({ auditMemberListed: jest.fn() }))
jest.mock("@/lib/utils/server-zone", () => ({ serverZone: jest.fn().mockResolvedValue("UTC") }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({ info: jest.fn(), error: jest.fn(), warn: jest.fn() }),
}))
jest.mock("@/lib/discord/audit", () => ({
  getCommandLogs: jest.fn().mockResolvedValue({ logs: [], total: 0 }),
  getCommandStats: jest.fn().mockResolvedValue([]),
  getDailyActivity: jest.fn().mockResolvedValue([]),
  getActiveUsers: jest.fn().mockResolvedValue([]),
  getSummaryStats: jest.fn().mockResolvedValue({ totalCommands: 3 }),
  getHelpCommandStats: jest.fn().mockResolvedValue(null),
  getAccountLinkingMetrics: jest.fn().mockResolvedValue(null),
  getMediaMarkingBreakdown: jest.fn().mockResolvedValue(null),
  getContextMetrics: jest.fn().mockResolvedValue(null),
  getErrorAnalysis: jest.fn().mockResolvedValue(null),
  getSelectionMenuStats: jest.fn().mockResolvedValue(null),
}))

const session = jest.mocked(getServerSession)
const groupBy = prisma.userMediaMark.groupBy as jest.Mock
const PERIOD = { startDate: "2026-07-01", endDate: "2026-07-31" }
const ADMIN = { user: { id: "admin-1", isAdmin: true }, expires: "" }

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "mark-1",
    title: "The Office",
    year: 2005,
    mediaType: "TV_SERIES",
    markType: "KEEP_FOREVER",
    seasonNumber: null,
    episodeNumber: null,
    parentTitle: null,
    note: null,
    markedVia: "discord",
    markedAt: new Date("2026-07-01T12:00:00Z"),
    radarrTitleSlug: null,
    sonarrTitleSlug: "the-office",
    user: { id: "u1", name: "Alice", email: "a@x.com", image: null },
    ...overrides,
  }
}

beforeEach(() => {
  mockReset(prismaMock)
  session.mockReset().mockResolvedValue(ADMIN)
  prismaMock.userMediaMark.findMany.mockResolvedValue([])
  prismaMock.userMediaMark.count.mockResolvedValue(0)
  groupBy.mockResolvedValue([] as never)
})

const listCall = () => prismaMock.userMediaMark.findMany.mock.calls[0][0]!

describe("getDiscordDashboardData", () => {
  it("reads the session once per dashboard load", async () => {
    await getDiscordDashboardData(PERIOD)

    expect(session).toHaveBeenCalledTimes(1)
  })

  it("audits the page as a listing of members' content, with its filters (P11.16)", async () => {
    await getDiscordDashboardData({ ...PERIOD, search: "office" })

    expect(auditMemberListed).toHaveBeenCalledWith("discord-activity", "admin-1", {
      startDate: "2026-07-01",
      endDate: "2026-07-31",
      markType: undefined,
      source: undefined,
      search: "office",
    })
  })

  it("refuses a member with the forbidden digest before reading anything", async () => {
    session.mockResolvedValue({ user: { id: "member-1", isAdmin: false }, expires: "" })

    await expect(getDiscordDashboardData(PERIOD)).rejects.toMatchObject({ digest: "PM_FORBIDDEN" })
    expect(prismaMock.userMediaMark.findMany).not.toHaveBeenCalled()
  })

  it("refuses a signed-out caller with the unauthenticated digest", async () => {
    session.mockResolvedValue(null)

    await expect(getDiscordDashboardData(PERIOD)).rejects.toMatchObject({ digest: "PM_UNAUTHENTICATED" })
  })

  it("rejects a malformed range", async () => {
    await expect(getDiscordDashboardData({ startDate: "nope", endDate: "2026-07-31" })).rejects.toThrow()
  })

  it("zero-fills the per-type summary and keeps it scoped to the period and source", async () => {
    groupBy.mockResolvedValue([
      { markType: "KEEP_FOREVER", _count: { _all: 3 } },
      { markType: "POOR_QUALITY", _count: { _all: 1 } },
    ] as never)

    const { markedMedia } = await getDiscordDashboardData({ ...PERIOD, markType: "POOR_QUALITY" })

    const byType = Object.fromEntries(markedMedia!.summary.map((entry) => [entry.markType, entry.count]))
    expect(markedMedia!.summary).toHaveLength(6)
    expect(byType).toMatchObject({ KEEP_FOREVER: 3, POOR_QUALITY: 1, FINISHED_WATCHING: 0 })
    expect(listCall().where).toMatchObject({ markType: "POOR_QUALITY" })
    expect(groupBy.mock.calls[0][0].where).not.toHaveProperty("markType")
  })

  it("ignores a mark type or source the URL got wrong", async () => {
    await getDiscordDashboardData({ ...PERIOD, markType: "BOGUS", source: "fax" })

    expect(listCall().where).not.toHaveProperty("markType")
    expect(listCall().where).not.toHaveProperty("markedVia")
  })

  it("applies the source, a case-insensitive search, the period and the page", async () => {
    prismaMock.userMediaMark.findMany.mockResolvedValue([row()] as never)
    prismaMock.userMediaMark.count.mockResolvedValue(1)

    const { markedMedia } = await getDiscordDashboardData({
      ...PERIOD,
      source: "web",
      search: " office ",
      marksLimit: 10,
      marksOffset: 20,
    })

    expect(listCall()).toMatchObject({
      where: {
        markedVia: "web",
        title: { contains: "office", mode: "insensitive" },
        markedAt: { gte: expect.any(Date), lt: expect.any(Date) },
      },
      take: 10,
      skip: 20,
    })
    expect(markedMedia).toMatchObject({ total: 1, marks: [{ title: "The Office", user: { name: "Alice" } }] })
  })

  it("blanks only the figure whose query fails", async () => {
    jest.mocked(getSummaryStats).mockRejectedValueOnce(new Error("db down"))
    prismaMock.userMediaMark.findMany.mockRejectedValue(new Error("db down"))

    const data = await getDiscordDashboardData(PERIOD)

    expect(data.summary).toBeNull()
    expect(data.markedMedia).toBeNull()
    expect(data.recent).toEqual({ logs: [], total: 0 })
  })
})
