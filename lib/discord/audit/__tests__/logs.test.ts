import { getCommandLogs } from "../logs"
import { prisma } from "@/lib/prisma"
import type {
  DiscordCommandLog,
  DiscordCommandType,
  DiscordCommandStatus,
} from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordCommandLog: {
      findMany: jest.fn(),
      count: jest.fn(),
    },
  },
}))

const mockFindMany = prisma.discordCommandLog.findMany as jest.MockedFunction<
  typeof prisma.discordCommandLog.findMany
>
const mockCount = prisma.discordCommandLog.count as jest.MockedFunction<
  typeof prisma.discordCommandLog.count
>

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}))

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

  describe("edge cases", () => {
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

  describe("date range boundary behavior", () => {
    /**
     * Verifies date range filtering uses correct operators:
     * - `gte` for startDate (inclusive)
     * - `lt` for endDate (exclusive, paired with toEndOfDayExclusive)
     * See: https://github.com/mchestr/plex-manager/pull/162
     */
    it("should include records from the entire end date when using lt with next day", async () => {
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-16T00:00:00.000Z")

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
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-16T00:00:00.000Z")

      const recordLateOnEndDate = createMockCommandLog({
        id: "included",
        createdAt: new Date("2024-01-15T23:59:59.999Z"),
      })

      mockFindMany.mockResolvedValue([recordLateOnEndDate])
      mockCount.mockResolvedValue(1)

      const result = await getCommandLogs({ startDate, endDate })

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: {
              gte: startDate,
              lt: endDate,
            },
          }),
        })
      )
      expect(result.logs).toHaveLength(1)
      expect(result.logs[0].id).toBe("included")
    })
  })
})
