import {
  createCommandLog,
  updateCommandLog,
  logCommandExecution,
  type CreateCommandLogParams,
  type UpdateCommandLogParams,
} from "../write"
import { prisma } from "@/lib/prisma"
import type {
  DiscordCommandLog,
  DiscordCommandType,
  DiscordCommandStatus,
} from "@/lib/generated/prisma/client"

jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordCommandLog: {
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}))

const mockCreate = prisma.discordCommandLog.create as jest.MockedFunction<
  typeof prisma.discordCommandLog.create
>
const mockUpdate = prisma.discordCommandLog.update as jest.MockedFunction<
  typeof prisma.discordCommandLog.update
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

  describe("edge cases", () => {
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
