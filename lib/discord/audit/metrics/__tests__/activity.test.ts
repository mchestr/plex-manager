import { getDailyActivity, getSummaryStats } from "../activity"
import { prisma } from "@/lib/prisma"

jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordCommandLog: {
      findMany: jest.fn(),
      count: jest.fn(),
      groupBy: jest.fn(),
      aggregate: jest.fn(),
    },
  },
}))

const mockFindMany = prisma.discordCommandLog.findMany as jest.Mock
const mockCount = prisma.discordCommandLog.count as jest.Mock
const mockGroupBy = prisma.discordCommandLog.groupBy as jest.Mock
const mockAggregate = prisma.discordCommandLog.aggregate as jest.Mock

jest.mock("@/lib/utils/logger", () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}))

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

  describe("date range boundary behavior", () => {
    it("should use lt operator for end date", async () => {
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-04T00:00:00.000Z")

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
      const endDate = new Date("2024-01-02T00:00:00.000Z")

      mockFindMany.mockResolvedValue([
        { createdAt: new Date("2024-01-01T23:59:59.000Z"), status: "SUCCESS" },
      ])

      const result = await getDailyActivity(startDate, endDate)

      expect(result).toEqual([
        { date: "2024-01-01", total: 1, success: 1, failed: 0 },
      ])
    })
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

  describe("date range boundary behavior", () => {
    it("should use lt operator for end date in all queries", async () => {
      const startDate = new Date("2024-01-01T00:00:00.000Z")
      const endDate = new Date("2024-01-16T00:00:00.000Z")

      mockCount.mockResolvedValue(0)
      mockAggregate.mockResolvedValue({ _avg: { responseTimeMs: null } })
      mockGroupBy.mockResolvedValue([])

      await getSummaryStats(startDate, endDate)

      // count queries use correct date operators
      expect(mockCount).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
      })

      // aggregate query uses correct date operators
      expect(mockAggregate).toHaveBeenCalledWith({
        where: {
          createdAt: {
            gte: startDate,
            lt: endDate,
          },
        },
        _avg: { responseTimeMs: true },
      })

      // groupBy queries use correct date operators
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
