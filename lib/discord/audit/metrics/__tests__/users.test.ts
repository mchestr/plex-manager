import { getActiveUsers, getAccountLinkingMetrics } from "../users"
import { prisma } from "@/lib/prisma"

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

  describe("date range boundary behavior", () => {
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
})

describe("getAccountLinkingMetrics", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return linking totals, daily trend, and repeat requesters", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-31")

    mockCount.mockResolvedValue(4)
    mockGroupBy.mockResolvedValue([
      { discordUserId: "discord-1", discordUsername: "user1", _count: 3 },
      { discordUserId: "discord-2", discordUsername: null, _count: 1 },
    ])
    mockFindMany.mockResolvedValue([
      { createdAt: new Date("2024-01-01T10:00:00Z") },
      { createdAt: new Date("2024-01-01T11:00:00Z") },
      { createdAt: new Date("2024-01-02T10:00:00Z") },
      { createdAt: new Date("2024-01-02T12:00:00Z") },
    ])

    const result = await getAccountLinkingMetrics(startDate, endDate)

    expect(mockCount).toHaveBeenCalledWith({
      where: {
        commandType: "LINK_REQUEST",
        createdAt: { gte: startDate, lt: endDate },
      },
    })

    expect(result).toEqual({
      totalLinkRequests: 4,
      uniqueUnlinkedUsers: 2,
      linkRequestsByDay: [
        { date: "2024-01-01", count: 2 },
        { date: "2024-01-02", count: 2 },
      ],
      repeatRequestUsers: [
        {
          discordUserId: "discord-1",
          discordUsername: "user1",
          requestCount: 3,
        },
      ],
    })
  })
})
