import {
  getErrorAnalysis,
  getSelectionMenuStats,
  getHelpCommandStats,
} from "../errors"
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

describe("getErrorAnalysis", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should analyze errors by type, command, samples, and trend", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-31")

    mockCount.mockResolvedValue(3)
    mockGroupBy
      .mockResolvedValueOnce([
        { commandType: "CHAT", _count: 2 },
        { commandType: "MEDIA_MARK", _count: 1 },
      ])
      .mockResolvedValueOnce([
        { commandName: "!assistant", _count: 2 },
        { commandName: "!finished", _count: 1 },
      ])
    mockFindMany.mockResolvedValue([
      {
        commandName: "!assistant",
        error: "timeout",
        createdAt: new Date("2024-01-01T10:00:00Z"),
      },
      {
        commandName: "!assistant",
        error: "429",
        createdAt: new Date("2024-01-01T11:00:00Z"),
      },
      {
        commandName: "!finished",
        error: "not found",
        createdAt: new Date("2024-01-02T10:00:00Z"),
      },
    ])

    const result = await getErrorAnalysis(startDate, endDate)

    expect(mockCount).toHaveBeenCalledWith({
      where: {
        status: { in: ["FAILED", "TIMEOUT"] },
        createdAt: { gte: startDate, lt: endDate },
      },
    })

    expect(result.totalErrors).toBe(3)
    expect(result.errorsByType).toEqual([
      { commandType: "CHAT", count: 2 },
      { commandType: "MEDIA_MARK", count: 1 },
    ])
    expect(result.errorsByCommand).toEqual([
      {
        commandName: "!assistant",
        count: 2,
        sampleErrors: ["timeout", "429"],
      },
      { commandName: "!finished", count: 1, sampleErrors: ["not found"] },
    ])
    expect(result.errorTrend).toEqual([
      { date: "2024-01-01", count: 2 },
      { date: "2024-01-02", count: 1 },
    ])
  })
})

describe("getSelectionMenuStats", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should count selections numerically and compute success rate", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-31")

    mockCount
      .mockResolvedValueOnce(4) // total selections
      .mockResolvedValueOnce(3) // success count
    mockAggregate.mockResolvedValue({ _avg: { responseTimeMs: 120 } })
    mockFindMany.mockResolvedValue([
      { commandArgs: "2" },
      { commandArgs: "1" },
      { commandArgs: "2" },
      { commandArgs: "3" },
    ])

    const result = await getSelectionMenuStats(startDate, endDate)

    expect(result).toEqual({
      totalSelections: 4,
      selectionsByNumber: [
        { selection: "1", count: 1 },
        { selection: "2", count: 2 },
        { selection: "3", count: 1 },
      ],
      successRate: 75,
      avgResponseTimeMs: 120,
    })
  })

  it("should handle zero selections", async () => {
    mockCount.mockResolvedValue(0)
    mockAggregate.mockResolvedValue({ _avg: { responseTimeMs: null } })
    mockFindMany.mockResolvedValue([])

    const result = await getSelectionMenuStats(
      new Date("2024-01-01"),
      new Date("2024-01-31")
    )

    expect(result.successRate).toBe(0)
    expect(result.avgResponseTimeMs).toBeNull()
    expect(result.selectionsByNumber).toEqual([])
  })
})

describe("getHelpCommandStats", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should split general vs specific help and sort topics", async () => {
    const startDate = new Date("2024-01-01")
    const endDate = new Date("2024-01-31")

    mockFindMany.mockResolvedValue([
      { commandArgs: "general" },
      { commandArgs: null },
      { commandArgs: "media" },
      { commandArgs: "media" },
      { commandArgs: "linking" },
    ])

    const result = await getHelpCommandStats(startDate, endDate)

    expect(mockFindMany).toHaveBeenCalledWith({
      where: {
        commandType: "HELP",
        createdAt: { gte: startDate, lt: endDate },
      },
      select: { commandArgs: true },
    })

    expect(result.totalHelpRequests).toBe(5)
    // Both "general" and a null/empty topic (mapped to "general") count as general.
    expect(result.generalHelpCount).toBe(2)
    expect(result.specificHelpCount).toBe(3)
    // "media" has the highest count; the two "general" topics (explicit + null)
    // both bucket to "general" and follow. Sorted by count desc (stable).
    expect(result.helpByTopic).toEqual([
      { topic: "general", count: 2 },
      { topic: "media", count: 2 },
      { topic: "linking", count: 1 },
    ])
  })
})
