import { withAuditLog } from "../audit-wrapper"
import { createCommandLog, updateCommandLog, type CreateCommandLogParams } from "../../audit"
import type { DiscordCommandLog, DiscordCommandType } from "@/lib/generated/prisma/client"

jest.mock("../../audit", () => ({
  createCommandLog: jest.fn(),
  updateCommandLog: jest.fn(),
}))

const mockCreate = createCommandLog as jest.MockedFunction<typeof createCommandLog>
const mockUpdate = updateCommandLog as jest.MockedFunction<typeof updateCommandLog>

const params: CreateCommandLogParams = {
  discordUserId: "discord-user-123",
  discordUsername: "testuser#1234",
  userId: "user-123",
  commandType: "HELP" as DiscordCommandType,
  commandName: "ping",
  channelId: "channel-123",
  channelType: "guild",
  guildId: "guild-123",
}

function createMockLog(overrides: Partial<DiscordCommandLog> = {}): DiscordCommandLog {
  return {
    id: "log-123",
    discordUserId: "discord-user-123",
    discordUsername: "testuser#1234",
    userId: "user-123",
    commandType: "HELP" as DiscordCommandType,
    commandName: "ping",
    commandArgs: null,
    channelId: "channel-123",
    channelType: "guild",
    guildId: "guild-123",
    status: "PENDING",
    error: null,
    responseTimeMs: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
    ...overrides,
  }
}

describe("withAuditLog", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("creates a log, runs fn, and updates SUCCESS on resolve", async () => {
    mockCreate.mockResolvedValue(createMockLog())
    mockUpdate.mockResolvedValue(createMockLog({ status: "SUCCESS" }))
    const fn = jest.fn().mockResolvedValue("result")

    const result = await withAuditLog(params, fn)

    expect(result).toBe("result")
    expect(mockCreate).toHaveBeenCalledWith(params)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(mockUpdate).toHaveBeenCalledWith(
      "log-123",
      expect.objectContaining({
        status: "SUCCESS",
        responseTimeMs: expect.any(Number),
      })
    )
  })

  it("updates FAILED with the error message and rethrows when fn throws", async () => {
    mockCreate.mockResolvedValue(createMockLog())
    mockUpdate.mockResolvedValue(createMockLog({ status: "FAILED" }))
    const boom = new Error("boom")
    const fn = jest.fn().mockRejectedValue(boom)

    await expect(withAuditLog(params, fn)).rejects.toThrow("boom")

    expect(mockUpdate).toHaveBeenCalledWith(
      "log-123",
      expect.objectContaining({
        status: "FAILED",
        error: "boom",
        responseTimeMs: expect.any(Number),
      })
    )
  })

  it("uses a fallback message for non-Error throws", async () => {
    mockCreate.mockResolvedValue(createMockLog())
    mockUpdate.mockResolvedValue(createMockLog({ status: "FAILED" }))
    const fn = jest.fn().mockRejectedValue("string failure")

    await expect(withAuditLog(params, fn)).rejects.toBe("string failure")

    expect(mockUpdate).toHaveBeenCalledWith(
      "log-123",
      expect.objectContaining({ status: "FAILED", error: "Unknown error" })
    )
  })

  it("still runs fn and skips update when the log could not be created", async () => {
    mockCreate.mockResolvedValue(null)
    const fn = jest.fn().mockResolvedValue("ok")

    const result = await withAuditLog(params, fn)

    expect(result).toBe("ok")
    expect(fn).toHaveBeenCalledTimes(1)
    expect(mockUpdate).not.toHaveBeenCalled()
  })

  it("rethrows without updating when fn throws and the log could not be created", async () => {
    mockCreate.mockResolvedValue(null)
    const fn = jest.fn().mockRejectedValue(new Error("boom"))

    await expect(withAuditLog(params, fn)).rejects.toThrow("boom")
    expect(mockUpdate).not.toHaveBeenCalled()
  })
})
