import {
  createCommandLog,
  updateCommandLog,
  logCommandExecution,
  getCommandLogs,
  getCommandStats,
  getDailyActivity,
  getActiveUsers,
  getSummaryStats,
  type CreateCommandLogParams,
  type UpdateCommandLogParams,
} from "../audit"
import { prisma } from "@/lib/prisma"
import type {
  DiscordCommandLog,
  DiscordCommandType,
  DiscordCommandStatus,
} from "@/lib/generated/prisma/client"

// Mock dependencies
jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordCommandLog: {
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}))

// Type-safe mock helpers using jest.MockedFunction
const mockCreate = prisma.discordCommandLog.create as jest.MockedFunction<
  typeof prisma.discordCommandLog.create
>
const mockUpdate = prisma.discordCommandLog.update as jest.MockedFunction<
  typeof prisma.discordCommandLog.update
>
const mockFindMany = prisma.discordCommandLog.findMany as jest.MockedFunction<
  typeof prisma.discordCommandLog.findMany
>
const mockCount = prisma.discordCommandLog.count as jest.MockedFunction<
  typeof prisma.discordCommandLog.count
>
const mockGroupBy = prisma.discordCommandLog.groupBy as jest.MockedFunction<
  typeof prisma.discordCommandLog.groupBy
>
const mockAggregate = prisma.discordCommandLog.aggregate as jest.MockedFunction<
  typeof prisma.discordCommandLog.aggregate
>

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}))

// Helper to create mock command log
function createMockCommandLog(
  overrides: Partial<DiscordCommandLog> = {}
): DiscordCommandLog {
  return {
    id: "log-123",
    discordUserId: "discord-user-123",
    discordUsername: "testuser#1234",
    userId: "user-123",
    commandType: "CHAT" as DiscordCommandType,
    commandName: "!assistant",
    commandArgs: "help me",
    channelId: "channel-123",
    channelType: "support-channel",
    guildId: "guild-123",
    status: "PENDING" as DiscordCommandStatus,
    error: null,
    responseTimeMs: null,
    startedAt: new Date("2024-01-15T10:00:00Z"),
    completedAt: null,
    createdAt: new Date("2024-01-15T10:00:00Z"),
    ...overrides,
  }
}

describe("createCommandLog", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should create a command log with all fields", async () => {
    const mockLog = createMockCommandLog()
    mockCreate.mockResolvedValue(mockLog)

    const params: CreateCommandLogParams = {
      discordUserId: "discord-user-123",
      discordUsername: "testuser#1234",
      userId: "user-123",
      commandType: "CHAT" as DiscordCommandType,
      commandName: "!assistant",
      commandArgs: "help me",
      channelId: "channel-123",
      channelType: "support-channel",
      guildId: "guild-123",
    }

    const result = await createCommandLog(params)

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        discordUserId: "discord-user-123",
        discordUsername: "testuser#1234",
        userId: "user-123",
        commandType: "CHAT",
        commandName: "!assistant",
        commandArgs: "help me",
        channelId: "channel-123",
        channelType: "support-channel",
        guildId: "guild-123",
        status: "PENDING",
        startedAt: expect.any(Date),
      },
    })
    expect(result).toEqual(mockLog)
  })

  it("should create a command log without optional fields", async () => {
    const mockLog = createMockCommandLog({
      discordUsername: null,
      userId: null,
      commandArgs: null,
      guildId: null,
    })
    mockCreate.mockResolvedValue(mockLog)

    const params: CreateCommandLogParams = {
      discordUserId: "discord-user-123",
      commandType: "MEDIA_MARK" as DiscordCommandType,
      commandName: "!finished",
      channelId: "channel-123",
      channelType: "dm",
    }

    const result = await createCommandLog(params)

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        discordUserId: "discord-user-123",
        discordUsername: undefined,
        userId: undefined,
        commandType: "MEDIA_MARK",
        commandName: "!finished",
        commandArgs: undefined,
        channelId: "channel-123",
        channelType: "dm",
        guildId: undefined,
        status: "PENDING",
        startedAt: expect.any(Date),
      },
    })
    expect(result).toEqual(mockLog)
  })

  it("should return null and log error on database failure", async () => {
    mockCreate.mockRejectedValue(new Error("Database connection failed"))

    const params: CreateCommandLogParams = {
      discordUserId: "discord-user-123",
      commandType: "CHAT" as DiscordCommandType,
      commandName: "!assistant",
      channelId: "channel-123",
      channelType: "support-channel",
    }

    const result = await createCommandLog(params)

    expect(result).toBeNull()
  })
})

describe("updateCommandLog", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should update a command log with success status", async () => {
    const mockLog = createMockCommandLog({
      status: "SUCCESS" as DiscordCommandStatus,
      responseTimeMs: 150,
      completedAt: new Date("2024-01-15T10:00:01Z"),
    })
    mockUpdate.mockResolvedValue(mockLog)

    const params: UpdateCommandLogParams = {
      status: "SUCCESS" as DiscordCommandStatus,
      responseTimeMs: 150,
    }

    const result = await updateCommandLog("log-123", params)

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "log-123" },
      data: {
        status: "SUCCESS",
        error: undefined,
        responseTimeMs: 150,
        completedAt: expect.any(Date),
      },
    })
    expect(result).toEqual(mockLog)
  })

  it("should update a command log with failed status and error", async () => {
    const mockLog = createMockCommandLog({
      status: "FAILED" as DiscordCommandStatus,
      error: "API timeout",
      responseTimeMs: 5000,
      completedAt: new Date("2024-01-15T10:00:05Z"),
    })
    mockUpdate.mockResolvedValue(mockLog)

    const params: UpdateCommandLogParams = {
      status: "FAILED" as DiscordCommandStatus,
      error: "API timeout",
      responseTimeMs: 5000,
    }

    const result = await updateCommandLog("log-123", params)

    expect(mockUpdate).toHaveBeenCalledWith({
      where: { id: "log-123" },
      data: {
        status: "FAILED",
        error: "API timeout",
        responseTimeMs: 5000,
        completedAt: expect.any(Date),
      },
    })
    expect(result).toEqual(mockLog)
  })

  it("should return null and log error on database failure", async () => {
    mockUpdate.mockRejectedValue(new Error("Record not found"))

    const params: UpdateCommandLogParams = {
      status: "SUCCESS" as DiscordCommandStatus,
    }

    const result = await updateCommandLog("nonexistent-log", params)

    expect(result).toBeNull()
  })
})

describe("logCommandExecution", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should create a complete command log in one call", async () => {
    const mockLog = createMockCommandLog({
      status: "SUCCESS" as DiscordCommandStatus,
      responseTimeMs: 100,
      completedAt: new Date("2024-01-15T10:00:01Z"),
    })
    mockCreate.mockResolvedValue(mockLog)

    const result = await logCommandExecution({
      discordUserId: "discord-user-123",
      discordUsername: "testuser#1234",
      userId: "user-123",
      commandType: "LINK_REQUEST" as DiscordCommandType,
      commandName: "link_request",
      channelId: "channel-123",
      channelType: "dm",
      status: "SUCCESS" as DiscordCommandStatus,
      responseTimeMs: 100,
    })

    expect(mockCreate).toHaveBeenCalledWith({
      data: {
        discordUserId: "discord-user-123",
        discordUsername: "testuser#1234",
        userId: "user-123",
        commandType: "LINK_REQUEST",
        commandName: "link_request",
        commandArgs: undefined,
        channelId: "channel-123",
        channelType: "dm",
        guildId: undefined,
        status: "SUCCESS",
        error: undefined,
        responseTimeMs: 100,
        startedAt: expect.any(Date),
        completedAt: expect.any(Date),
      },
    })
    expect(result).toEqual(mockLog)
  })

  it("should create a failed command log with error", async () => {
    const mockLog = createMockCommandLog({
      status: "FAILED" as DiscordCommandStatus,
      error: "User not linked",
    })
    mockCreate.mockResolvedValue(mockLog)

    const result = await logCommandExecution({
      discordUserId: "discord-user-123",
      commandType: "CHAT" as DiscordCommandType,
      commandName: "!assistant",
      commandArgs: "help",
      channelId: "channel-123",
      channelType: "support-channel",
      status: "FAILED" as DiscordCommandStatus,
      error: "User not linked",
    })

    expect(mockCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({
        status: "FAILED",
        error: "User not linked",
      }),
    })
    expect(result).toEqual(mockLog)
  })

  it("should return null on database failure", async () => {
    mockCreate.mockRejectedValue(new Error("Database error"))

    const result = await logCommandExecution({
      discordUserId: "discord-user-123",
      commandType: "CHAT" as DiscordCommandType,
      commandName: "!assistant",
      channelId: "channel-123",
      channelType: "dm",
      status: "SUCCESS" as DiscordCommandStatus,
    })

    expect(result).toBeNull()
  })
})

describe("getCommandLogs", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return logs with default pagination", async () => {
    const mockLogs = [
      createMockCommandLog({ id: "log-1" }),
      createMockCommandLog({ id: "log-2" }),
    ]
    mockFindMany.mockResolvedValue(mockLogs)
    mockCount.mockResolvedValue(2)

    const result = await getCommandLogs()

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: 0,
    })
    expect(mockCount).toHaveBeenCalledWith({ where: {} })
    expect(result).toEqual({ logs: mockLogs, total: 2 })
  })

  it("should apply custom pagination", async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(100)

    await getCommandLogs({ limit: 20, offset: 40 })

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {},
      orderBy: { createdAt: "desc" },
      take: 20,
      skip: 40,
    })
  })

  // Parameterized tests for single-field filters
  test.each([
    {
      filterName: "discordUserId",
      params: { discordUserId: "discord-123" },
      expectedWhere: { discordUserId: "discord-123" },
    },
    {
      filterName: "userId",
      params: { userId: "user-123" },
      expectedWhere: { userId: "user-123" },
    },
    {
      filterName: "commandType",
      params: { commandType: "MEDIA_MARK" as DiscordCommandType },
      expectedWhere: { commandType: "MEDIA_MARK" },
    },
    {
      filterName: "commandName",
      params: { commandName: "!finished" },
      expectedWhere: { commandName: "!finished" },
    },
    {
      filterName: "status",
      params: { status: "FAILED" as DiscordCommandStatus },
      expectedWhere: { status: "FAILED" },
    },
    {
      filterName: "channelId",
      params: { channelId: "channel-456" },
      expectedWhere: { channelId: "channel-456" },
    },
  ])("should filter by $filterName", async ({ params, expectedWhere }) => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    await getCommandLogs(params)

    expect(mockFindMany).toHaveBeenCalledWith({
      where: expectedWhere,
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: 0,
    })
  })

  it("should filter by date range", async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-31")

    await getCommandLogs({ startDate, endDate })

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: 0,
    })
  })

  it("should filter by startDate only", async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    const startDate = new Date("2024-01-01")

    await getCommandLogs({ startDate })

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: startDate,
        },
      },
      orderBy: { createdAt: "desc" },
      take: 50,
      skip: 0,
    })
  })

  it("should combine multiple filters", async () => {
    mockFindMany.mockResolvedValue([])
    mockCount.mockResolvedValue(0)

    await getCommandLogs({
      discordUserId: "discord-123",
      commandType: "CHAT" as DiscordCommandType,
      status: "SUCCESS" as DiscordCommandStatus,
      limit: 10,
    })

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        discordUserId: "discord-123",
        commandType: "CHAT",
        status: "SUCCESS",
      },
      orderBy: { createdAt: "desc" },
      take: 10,
      skip: 0,
    })
  })
})

describe("getCommandStats", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return command statistics for date range", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-31")

    mockGroupBy.mockResolvedValue([
      {
        commandName: "!assistant",
        commandType: "CHAT" as DiscordCommandType,
        _count: { _all: 100 },
        _avg: { responseTimeMs: 250 },
      },
      {
        commandName: "!finished",
        commandType: "MEDIA_MARK" as DiscordCommandType,
        _count: { _all: 50 },
        _avg: { responseTimeMs: 150 },
      },
    ])

    // Mock success/failed counts for each command
    mockCount
      .mockResolvedValueOnce(95) // !assistant success
      .mockResolvedValueOnce(5) // !assistant failed
      .mockResolvedValueOnce(48) // !finished success
      .mockResolvedValueOnce(2) // !finished failed

    const result = await getCommandStats(startDate, endDate)

    expect(mockGroupBy).toHaveBeenCalledWith({
      by: ["commandName", "commandType"],
      where: {
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      _count: { _all: true },
      _avg: { responseTimeMs: true },
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

  it("should handle empty results", async () => {
    mockGroupBy.mockResolvedValue([])

    const result = await getCommandStats(
      new Date("2024-01-01"),
      new Date("2024-01-31")
    )

    expect(result).toEqual([])
  })

  it("should handle null average response time", async () => {
    mockGroupBy.mockResolvedValue([
      {
        commandName: "!clear",
        commandType: "CLEAR_CONTEXT" as DiscordCommandType,
        _count: { _all: 10 },
        _avg: { responseTimeMs: null },
      },
    ])

    mockCount
      .mockResolvedValueOnce(10) // success
      .mockResolvedValueOnce(0) // failed

    const result = await getCommandStats(
      new Date("2024-01-01"),
      new Date("2024-01-31")
    )

    expect(result[0].avgResponseTimeMs).toBeNull()
  })
})

describe("getDailyActivity", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return daily activity grouped by date", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-03")

    mockFindMany.mockResolvedValue([
      { createdAt: new Date("2024-01-01T10:00:00Z"), status: "SUCCESS" },
      { createdAt: new Date("2024-01-01T11:00:00Z"), status: "SUCCESS" },
      { createdAt: new Date("2024-01-01T12:00:00Z"), status: "FAILED" },
      { createdAt: new Date("2024-01-02T10:00:00Z"), status: "SUCCESS" },
      { createdAt: new Date("2024-01-03T10:00:00Z"), status: "PENDING" },
    ])

    const result = await getDailyActivity(startDate, endDate)

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      select: {
        createdAt: true,
        status: true,
      },
      orderBy: {
        createdAt: "asc",
      },
    })

    expect(result).toEqual([
      { date: "2024-01-01", total: 3, success: 2, failed: 1 },
      { date: "2024-01-02", total: 1, success: 1, failed: 0 },
      { date: "2024-01-03", total: 1, success: 0, failed: 0 },
    ])
  })

  it("should handle empty results", async () => {
    mockFindMany.mockResolvedValue([])

    const result = await getDailyActivity(
      new Date("2024-01-01"),
      new Date("2024-01-31")
    )

    expect(result).toEqual([])
  })

  it("should only count SUCCESS and FAILED statuses", async () => {
    mockFindMany.mockResolvedValue([
      { createdAt: new Date("2024-01-01T10:00:00Z"), status: "PENDING" },
      { createdAt: new Date("2024-01-01T11:00:00Z"), status: "TIMEOUT" },
      { createdAt: new Date("2024-01-01T12:00:00Z"), status: "SUCCESS" },
      { createdAt: new Date("2024-01-01T13:00:00Z"), status: "FAILED" },
    ])

    const result = await getDailyActivity(
      new Date("2024-01-01"),
      new Date("2024-01-01")
    )

    expect(result).toEqual([
      { date: "2024-01-01", total: 4, success: 1, failed: 1 },
    ])
  })
})

describe("getActiveUsers", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return active users sorted by command count", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-31")

    mockGroupBy.mockResolvedValue([
      {
        discordUserId: "discord-1",
        discordUsername: "user1#1234",
        userId: "user-1",
        _count: { _all: 50 },
        _max: { createdAt: new Date("2024-01-30T10:00:00Z") },
      },
      {
        discordUserId: "discord-2",
        discordUsername: "user2#5678",
        userId: "user-2",
        _count: { _all: 25 },
        _max: { createdAt: new Date("2024-01-29T10:00:00Z") },
      },
    ])

    const result = await getActiveUsers(startDate, endDate)

    expect(mockGroupBy).toHaveBeenCalledWith({
      by: ["discordUserId", "discordUsername", "userId"],
      where: {
        createdAt: {
          gte: startDate,
          lt: endDate,
        },
      },
      _count: { _all: true },
      _max: { createdAt: true },
      orderBy: {
        _count: {
          discordUserId: "desc",
        },
      },
      take: 20,
    })

    expect(result).toEqual([
      {
        discordUserId: "discord-1",
        discordUsername: "user1#1234",
        userId: "user-1",
        commandCount: 50,
        lastActiveAt: new Date("2024-01-30T10:00:00Z"),
      },
      {
        discordUserId: "discord-2",
        discordUsername: "user2#5678",
        userId: "user-2",
        commandCount: 25,
        lastActiveAt: new Date("2024-01-29T10:00:00Z"),
      },
    ])
  })

  it("should apply custom limit", async () => {
    mockGroupBy.mockResolvedValue([])

    await getActiveUsers(new Date("2024-01-01"), new Date("2024-01-31"), 5)

    expect(mockGroupBy).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
      })
    )
  })

  it("should handle users without linked accounts", async () => {
    mockGroupBy.mockResolvedValue([
      {
        discordUserId: "discord-1",
        discordUsername: null,
        userId: null,
        _count: { _all: 10 },
        _max: { createdAt: new Date("2024-01-15T10:00:00Z") },
      },
    ])

    const result = await getActiveUsers(
      new Date("2024-01-01"),
      new Date("2024-01-31")
    )

    expect(result).toEqual([
      {
        discordUserId: "discord-1",
        discordUsername: null,
        userId: null,
        commandCount: 10,
        lastActiveAt: new Date("2024-01-15T10:00:00Z"),
      },
    ])
  })
})

describe("getSummaryStats", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return comprehensive summary statistics", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-31")

    mockCount
      .mockResolvedValueOnce(1000) // total commands
      .mockResolvedValueOnce(950) // success count

    mockAggregate.mockResolvedValue({
      _avg: { responseTimeMs: 200 },
    })

    // Unique users groupBy
    mockGroupBy
      .mockResolvedValueOnce([
        { discordUserId: "user-1" },
        { discordUserId: "user-2" },
        { discordUserId: "user-3" },
      ])
      // Commands by type groupBy
      .mockResolvedValueOnce([
        { commandType: "CHAT", _count: { _all: 600 } },
        { commandType: "MEDIA_MARK", _count: { _all: 300 } },
        { commandType: "CLEAR_CONTEXT", _count: { _all: 100 } },
      ])

    const result = await getSummaryStats(startDate, endDate)

    expect(result).toEqual({
      totalCommands: 1000,
      successRate: 95,
      avgResponseTimeMs: 200,
      uniqueUsers: 3,
      commandsByType: [
        { type: "CHAT", count: 600 },
        { type: "MEDIA_MARK", count: 300 },
        { type: "CLEAR_CONTEXT", count: 100 },
      ],
    })
  })

  it("should handle zero commands", async () => {
    mockCount
      .mockResolvedValueOnce(0) // total commands
      .mockResolvedValueOnce(0) // success count

    mockAggregate.mockResolvedValue({
      _avg: { responseTimeMs: null },
    })

    mockGroupBy
      .mockResolvedValueOnce([]) // unique users
      .mockResolvedValueOnce([]) // commands by type

    const result = await getSummaryStats(
      new Date("2024-01-01"),
      new Date("2024-01-31")
    )

    expect(result).toEqual({
      totalCommands: 0,
      successRate: 0,
      avgResponseTimeMs: null,
      uniqueUsers: 0,
      commandsByType: [],
    })
  })

  it("should calculate correct success rate", async () => {
    mockCount
      .mockResolvedValueOnce(100) // total commands
      .mockResolvedValueOnce(75) // success count

    mockAggregate.mockResolvedValue({
      _avg: { responseTimeMs: 150 },
    })

    mockGroupBy
      .mockResolvedValueOnce([{ discordUserId: "user-1" }])
      .mockResolvedValueOnce([])

    const result = await getSummaryStats(
      new Date("2024-01-01"),
      new Date("2024-01-31")
    )

    expect(result.successRate).toBe(75)
  })
})

describe("Date range boundary behavior", () => {
  /**
   * These tests verify that date range filtering uses the correct operators:
   * - `gte` (greater than or equal) for startDate: includes records from the start date
   * - `lt` (less than) for endDate: when used with toEndOfDayExclusive(), includes all
   *   records from the end date but excludes records from the next day
   *
   * This is the pattern used after PR #162 to fix inclusive date range filtering.
   * See: https://github.com/mchestr/plex-manager/pull/162
   *
   * NOTE on date-fns evaluation (GitHub issue #164):
   * The current implementation uses native Date math (adding 24 hours in milliseconds).
   * This is simple, works correctly for UTC dates, and doesn't require an external library.
   * date-fns would provide more readable methods like `addDays()` and `startOfDay()`,
   * but the added dependency isn't justified for this single use case. If more complex
   * date manipulations are needed in the future (timezone handling, date formatting),
   * consider adopting date-fns then.
   */

  const mockFindMany = prisma.discordCommandLog.findMany as jest.Mock
  const mockCount = prisma.discordCommandLog.count as jest.Mock
  const mockGroupBy = prisma.discordCommandLog.groupBy as jest.Mock
  const mockAggregate = prisma.discordCommandLog.aggregate as jest.Mock

  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("getCommandLogs date range", () => {
    it("should include records from the entire end date when using lt with next day", async () => {
      // Scenario: User selects date range "2024-01-01" to "2024-01-15"
      // After toEndOfDayExclusive(), endDate becomes "2024-01-16T00:00:00Z"
      // Using `lt` should include all records from "2024-01-15"
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-16T00:00:00.000Z") // Next day midnight (after toEndOfDayExclusive)

      mockFindMany.mockResolvedValue([])
      mockCount.mockResolvedValue(0)

      await getCommandLogs({ startDate, endDate })

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        orderBy: { createdAt: "desc" },
        take: 50,
        skip: 0,
      })
    })

    it("should exclude records from the day after end date", async () => {
      // This test demonstrates the filtering behavior:
      // Records at 2024-01-15T23:59:59.999Z should be included (lt 2024-01-16T00:00:00Z)
      // Records at 2024-01-16T00:00:00.001Z should be excluded
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-16T00:00:00.000Z") // Next day midnight

      const recordLateOnEndDate = createMockCommandLog({
        id: "included",
        createdAt: new Date("2024-01-15T23:59:59.999Z"),
      })

      mockFindMany.mockResolvedValue([recordLateOnEndDate])
      mockCount.mockResolvedValue(1)

      const result = await getCommandLogs({ startDate, endDate })

      // Verify the query uses lt operator for proper boundary handling
      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: startDate,
              lt: endDate, // lt ensures proper exclusive upper bound
            },
          }),
        })
      )
      expect(result.logs).toHaveLength(1)
      expect(result.logs[0].id).toBe("included")
    })
  })

  describe("getCommandStats date range", () => {
    it("should use lt operator for end date in groupBy query", async () => {
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-16T00:00:00.000Z") // After toEndOfDayExclusive

      mockGroupBy.mockResolvedValue([])

      await getCommandStats(startDate, endDate)

      expect(mockGroupBy).toHaveBeenCalledWith({
        by: ["commandName", "commandType"],
        where: {
          createdAt: {
            gte: startDate,
            lt: endDate, // Exclusive upper bound
          },
        },
        _count: { _all: true },
        _avg: { responseTimeMs: true },
      })
    })

    it("should include records from late in the end date in success/failed counts", async () => {
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-16T00:00:00.000Z")

      mockGroupBy.mockResolvedValue([
        {
          commandName: "!test",
          commandType: "CHAT" as DiscordCommandType,
          _count: { _all: 10 },
          _avg: { responseTimeMs: 100 },
        },
      ])

      mockCount
        .mockResolvedValueOnce(8) // success count
        .mockResolvedValueOnce(2) // failed count

      await getCommandStats(startDate, endDate)

      // Verify the success/failed count queries also use lt for endDate
      expect(mockCount).toHaveBeenNthCalledWith(1, {
        where: {
          commandName: "!test",
          commandType: "CHAT",
          status: "SUCCESS",
          createdAt: { gte: startDate, lt: endDate },
        },
      })
      expect(mockCount).toHaveBeenNthCalledWith(2, {
        where: {
          commandName: "!test",
          commandType: "CHAT",
          status: "FAILED",
          createdAt: { gte: startDate, lt: endDate },
        },
      })
    })
  })

  describe("getDailyActivity date range", () => {
    it("should use lt operator for end date", async () => {
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-04T00:00:00.000Z") // After toEndOfDayExclusive for "2024-01-03"

      mockFindMany.mockResolvedValue([])

      await getDailyActivity(startDate, endDate)

      expect(mockFindMany).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        select: {
          createdAt: true,
          status: true,
        },
        orderBy: {
          createdAt: "asc",
        },
      })
    })

    it("should include activity from late evening of end date", async () => {
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-02T00:00:00.000Z") // Query for just Jan 1st

      // Record at 11:59 PM on Jan 1st should be included
      mockFindMany.mockResolvedValue([
        { createdAt: new Date("2024-01-01T23:59:59.000Z"), status: "SUCCESS" },
      ])

      const result = await getDailyActivity(startDate, endDate)

      expect(result).toEqual([
        { date: "2024-01-01", total: 1, success: 1, failed: 0 },
      ])
    })
  })

  describe("getActiveUsers date range", () => {
    it("should use lt operator for end date", async () => {
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-16T00:00:00.000Z")

      mockGroupBy.mockResolvedValue([])

      await getActiveUsers(startDate, endDate)

      expect(mockGroupBy).toHaveBeenCalledWith({
        by: ["discordUserId", "discordUsername", "userId"],
        where: {
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        _count: { _all: true },
        _max: { createdAt: true },
        orderBy: {
          _count: {
            discordUserId: "desc",
          },
        },
        take: 20,
      })
    })
  })

  describe("getSummaryStats date range", () => {
    it("should use lt operator for end date in all queries", async () => {
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-16T00:00:00.000Z")

      mockCount.mockResolvedValue(0)
      mockAggregate.mockResolvedValue({ _avg: { responseTimeMs: null } })
      mockGroupBy.mockResolvedValue([])

      await getSummaryStats(startDate, endDate)

      // Verify count queries use correct date operators
      expect(mockCount).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
      })

      // Verify aggregate query uses correct date operators
      expect(mockAggregate).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        _avg: { responseTimeMs: true },
      })

      // Verify groupBy queries use correct date operators
      expect(mockGroupBy).toHaveBeenCalledWith({
        by: ["discordUserId"],
        where: {
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
      })
    })
  })
})

describe("Edge cases and error handling", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  describe("createCommandLog edge cases", () => {
    it("should handle very long command arguments", async () => {
      const longArgs = "a".repeat(10000)
      const mockLog = createMockCommandLog({ commandArgs: longArgs })
      mockCreate.mockResolvedValue(mockLog)

      const result = await createCommandLog({
        discordUserId: "discord-123",
        commandType: "CHAT" as DiscordCommandType,
        commandName: "!assistant",
        commandArgs: longArgs,
        channelId: "channel-123",
        channelType: "dm",
      })

      expect(result).toEqual(mockLog)
    })

    it("should handle special characters in command args", async () => {
      const specialArgs = "Test <script>alert('xss')</script> & \"quotes\""
      const mockLog = createMockCommandLog({ commandArgs: specialArgs })
      mockCreate.mockResolvedValue(mockLog)

      const result = await createCommandLog({
        discordUserId: "discord-123",
        commandType: "CHAT" as DiscordCommandType,
        commandName: "!assistant",
        commandArgs: specialArgs,
        channelId: "channel-123",
        channelType: "dm",
      })

      expect(mockCreate).toHaveBeenCalledWith({
        data: expect.objectContaining({
          commandArgs: specialArgs,
        }),
      })
      expect(result).toEqual(mockLog)
    })
  })

  describe("getCommandLogs edge cases", () => {
    it("should handle large offset values", async () => {
      mockFindMany.mockResolvedValue([])
      mockCount.mockResolvedValue(100)

      const result = await getCommandLogs({ offset: 1000000 })

      expect(result).toEqual({ logs: [], total: 100 })
    })

    it("should handle zero limit", async () => {
      mockFindMany.mockResolvedValue([])
      mockCount.mockResolvedValue(100)

      // Note: The function doesn't validate limit=0, so it passes through
      await getCommandLogs({ limit: 0 })

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          take: 0,
        })
      )
    })
  })
})
