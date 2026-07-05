import {
  getCommandStats,
  getMediaMarkingBreakdown,
  getContextMetrics,
} from "../commands"
import { prisma } from "@/lib/prisma"
import type { DiscordCommandType } from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordCommandLog: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
    },
  },
}))

const mockFindMany = prisma.discordCommandLog.findMany as jest.Mock
const mockCount = prisma.discordCommandLog.count as jest.Mock
const mockGroupBy = prisma.discordCommandLog.groupBy as jest.Mock

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}))

describe("getCommandStats", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return command statistics for date range", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-31")

    // Single groupBy over (commandName, commandType, status) folded client-side.
    // !assistant: SUCCESS(95) + FAILED(5) = 100 total, avg 250 (25000 / 100)
    // !finished:  SUCCESS(48) + FAILED(2) = 50 total,  avg 150 (7500 / 50)
    mockGroupBy.mockResolvedValue([
      {
        commandName: "!assistant",
        commandType: "CHAT" as DiscordCommandType,
        status: "SUCCESS",
        _count: { _all: 95, responseTimeMs: 95 },
        _sum: { responseTimeMs: 23750 },
      },
      {
        commandName: "!assistant",
        commandType: "CHAT" as DiscordCommandType,
        status: "FAILED",
        _count: { _all: 5, responseTimeMs: 5 },
        _sum: { responseTimeMs: 1250 },
      },
      {
        commandName: "!finished",
        commandType: "MEDIA_MARK" as DiscordCommandType,
        status: "SUCCESS",
        _count: { _all: 48, responseTimeMs: 48 },
        _sum: { responseTimeMs: 7200 },
      },
      {
        commandName: "!finished",
        commandType: "MEDIA_MARK" as DiscordCommandType,
        status: "FAILED",
        _count: { _all: 2, responseTimeMs: 2 },
        _sum: { responseTimeMs: 300 },
      },
    ])

    const result = await getCommandStats(startDate, endDate)

    expect(mockGroupBy).toHaveBeenCalledWith({
      by: ["commandName", "commandType", "status"],
      where: {
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      _count: { _all: true, responseTimeMs: true },
      _sum: { responseTimeMs: true },
    })

    expect(result).toEqual([
      {
        commandName: "!assistant",
        commandType: "CHAT",
        totalCount: 100,
        successCount: 95,
        failedCount: 5,
        avgResponseTimeMs: 250,
      },
      {
        commandName: "!finished",
        commandType: "MEDIA_MARK",
        totalCount: 50,
        successCount: 48,
        failedCount: 2,
        avgResponseTimeMs: 150,
      },
    ])
  })

  it("should issue exactly one groupBy and no per-group count queries (N+1 fix)", async () => {
    mockGroupBy.mockResolvedValue([
      {
        commandName: "!assistant",
        commandType: "CHAT" as DiscordCommandType,
        status: "SUCCESS",
        _count: { _all: 95, responseTimeMs: 95 },
        _sum: { responseTimeMs: 23750 },
      },
      {
        commandName: "!assistant",
        commandType: "CHAT" as DiscordCommandType,
        status: "FAILED",
        _count: { _all: 5, responseTimeMs: 5 },
        _sum: { responseTimeMs: 1250 },
      },
      {
        commandName: "!finished",
        commandType: "MEDIA_MARK" as DiscordCommandType,
        status: "SUCCESS",
        _count: { _all: 48, responseTimeMs: 48 },
        _sum: { responseTimeMs: 7200 },
      },
    ])

    await getCommandStats(new Date("2024-01-01"), new Date("2024-01-31"))

    // Previously this issued 1 groupBy + 2 count() per command group.
    // Now it must be a single query and zero count() calls regardless of the
    // number of command groups returned.
    expect(mockGroupBy).toHaveBeenCalledTimes(1)
    expect(mockCount).not.toHaveBeenCalled()
  })

  it("should handle empty results", async () => {
    mockGroupBy.mockResolvedValue([])

    const result = await getCommandStats(
      new Date("2024-01-01"),
      new Date("2024-01-31")
    )

    expect(result).toEqual([])
  })

  it("should handle null average response time", async () => {
    // No timed rows -> _sum is null, so avg should be null.
    mockGroupBy.mockResolvedValue([
      {
        commandName: "!clear",
        commandType: "CLEAR_CONTEXT" as DiscordCommandType,
        status: "SUCCESS",
        _count: { _all: 10, responseTimeMs: 0 },
        _sum: { responseTimeMs: null },
      },
    ])

    const result = await getCommandStats(
      new Date("2024-01-01"),
      new Date("2024-01-31")
    )

    expect(result[0].avgResponseTimeMs).toBeNull()
    expect(result[0].totalCount).toBe(10)
    expect(result[0].successCount).toBe(10)
    expect(result[0].failedCount).toBe(0)
  })

  describe("date range boundary behavior", () => {
    it("should use lt operator for end date in the grouped query", async () => {
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-16T00:00:00.000Z")

      mockGroupBy.mockResolvedValue([])

      await getCommandStats(startDate, endDate)

      expect(mockGroupBy).toHaveBeenCalledWith({
        by: ["commandName", "commandType", "status"],
        where: {
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        _count: { _all: true, responseTimeMs: true },
        _sum: { responseTimeMs: true },
      })
    })
  })
})

describe("getMediaMarkingBreakdown", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should aggregate per-command counts and top media titles", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-31")

    mockGroupBy.mockResolvedValue([
      { commandName: "!finished", _count: 3 },
      { commandName: "!watching", _count: 1 },
    ])
    mockFindMany.mockResolvedValue([
      { commandName: "!finished", commandArgs: "Inception", status: "SUCCESS" },
      { commandName: "!finished", commandArgs: "Inception", status: "SUCCESS" },
      { commandName: "!finished", commandArgs: "Dune", status: "FAILED" },
      { commandName: "!watching", commandArgs: "Dune", status: "SUCCESS" },
    ])

    const result = await getMediaMarkingBreakdown(startDate, endDate)

    expect(mockGroupBy).toHaveBeenCalledWith({
      by: ["commandName"],
      where: {
        commandType: "MEDIA_MARK",
        createdAt: { gte: startDate, lt: endDate },
      },
      _count: true,
    })

    expect(result.byCommand).toEqual([
      { commandName: "!finished", count: 3, successCount: 2, failedCount: 1 },
      { commandName: "!watching", count: 1, successCount: 1, failedCount: 0 },
    ])
    expect(result.topMediaMarked).toEqual([
      { title: "Inception", count: 2 },
      { title: "Dune", count: 1 },
    ])
  })

  it("should handle empty results", async () => {
    mockGroupBy.mockResolvedValue([])
    mockFindMany.mockResolvedValue([])

    const result = await getMediaMarkingBreakdown(
      new Date("2024-01-01"),
      new Date("2024-01-31")
    )

    expect(result).toEqual({ byCommand: [], topMediaMarked: [] })
  })
})

describe("getContextMetrics", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return context clear totals sorted by count", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-31")

    mockCount.mockResolvedValue(6)
    mockGroupBy
      .mockResolvedValueOnce([
        { commandName: "!clear", _count: 4 },
        { commandName: "!reset", _count: 2 },
      ])
      .mockResolvedValueOnce([
        {
          discordUserId: "discord-1",
          discordUsername: "user1",
          _count: 5,
        },
        {
          discordUserId: "discord-2",
          discordUsername: null,
          _count: 1,
        },
      ])

    const result = await getContextMetrics(startDate, endDate)

    expect(result).toEqual({
      totalClears: 6,
      clearsByCommand: [
        { commandName: "!clear", count: 4 },
        { commandName: "!reset", count: 2 },
      ],
      topClearUsers: [
        { discordUserId: "discord-1", discordUsername: "user1", clearCount: 5 },
        { discordUserId: "discord-2", discordUsername: null, clearCount: 1 },
      ],
    })
  })
})
