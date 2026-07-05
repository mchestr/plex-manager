/**
 * Tests for the DM router (Step 13).
 *
 * The router handles direct-message `messageCreate` events for the DM-based AI
 * assistant. discord.js is not loaded at runtime here (only `ChannelType` is
 * referenced, and that is a plain numeric enum), so we stub it. The audit DB
 * writes are stubbed so `withAuditLog` runs for real without a live database.
 */

jest.mock("discord.js", () => ({
  ChannelType: { DM: 1, GuildText: 0 },
}))

// Let withAuditLog run for real, but stub the DB writes it delegates to so we
// can assert the CHAT audit lifecycle without a live database.
jest.mock("../../audit", () => ({
  createCommandLog: jest.fn(),
  updateCommandLog: jest.fn(),
}))

// The router's default collaborators transitively load lib/prisma (which
// requires DATABASE_URL). Stub the services module — tests always inject their
// own deps, so the real implementations are never exercised here.
jest.mock("../../services", () => ({
  verifyDiscordUser: jest.fn(),
  handleDiscordChat: jest.fn(),
  clearDiscordChat: jest.fn(),
}))

import { routeDirectMessage, type DmRouteDeps } from "../dm-router"
import { createCommandLog, updateCommandLog } from "../../audit"
import type { Message } from "discord.js"
import type {
  ClearChatResult,
  DiscordChatResult,
  VerifyDiscordUserResult,
} from "../../services"
import type { DiscordCommandLog, DiscordCommandType } from "@/lib/generated/prisma/client"

const mockCreate = createCommandLog as jest.MockedFunction<typeof createCommandLog>
const mockUpdate = updateCommandLog as jest.MockedFunction<typeof updateCommandLog>

function createMockLog(): DiscordCommandLog {
  return {
    id: "log-1",
    discordUserId: "discord-user-1",
    discordUsername: "tester#0001",
    userId: "user-1",
    commandType: "CHAT" as DiscordCommandType,
    commandName: "dm",
    commandArgs: null,
    channelId: "dm-channel-1",
    channelType: "dm",
    guildId: null,
    status: "PENDING",
    error: null,
    responseTimeMs: null,
    startedAt: new Date(),
    completedAt: null,
    createdAt: new Date(),
  }
}

const linkedUser: VerifyDiscordUserResult = {
  linked: true,
  user: {
    id: "user-1",
    name: "Test User",
    email: "t@example.com",
    plexUserId: "plex-1",
    isAdmin: false,
  },
}

const chatSuccess: DiscordChatResult = {
  success: true,
  linked: true,
  message: { role: "assistant", content: "Here is your answer.", timestamp: 0 },
  conversationId: "conv-1",
}

const clearSuccess: ClearChatResult = {
  success: true,
  linked: true,
  conversationId: "conv-2",
}

interface MockMessageOptions {
  content?: string
  isBot?: boolean
  isDm?: boolean
}

function createMockMessage(options: MockMessageOptions = {}) {
  const reply = jest.fn().mockResolvedValue(undefined)
  const sendTyping = jest.fn().mockResolvedValue(undefined)

  const isDm = options.isDm ?? true

  const message = {
    content: options.content ?? "hello there",
    author: { id: "discord-user-1", tag: "tester#0001", bot: options.isBot ?? false },
    channelId: "dm-channel-1",
    guildId: isDm ? null : "guild-1",
    channel: {
      type: isDm ? 1 : 0, // ChannelType.DM = 1
      isSendable: () => true,
      sendTyping,
    },
    reply,
  }

  return { message: message as unknown as Message, reply, sendTyping }
}

function makeDeps(overrides: Partial<DmRouteDeps> = {}): DmRouteDeps {
  return {
    verifyDiscordUser: jest.fn().mockResolvedValue(linkedUser),
    handleDiscordChat: jest.fn().mockResolvedValue(chatSuccess),
    clearDiscordChat: jest.fn().mockResolvedValue(clearSuccess),
    portalUrl: "https://example.com/discord/link",
    ...overrides,
  }
}

describe("routeDirectMessage", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockCreate.mockResolvedValue(createMockLog())
    mockUpdate.mockResolvedValue(createMockLog())
  })

  it("ignores the bot's own messages", async () => {
    const deps = makeDeps()
    const { message, reply } = createMockMessage({ isBot: true })

    await routeDirectMessage(message, deps)

    expect(deps.verifyDiscordUser).not.toHaveBeenCalled()
    expect(reply).not.toHaveBeenCalled()
  })

  it("ignores non-DM messages", async () => {
    const deps = makeDeps()
    const { message, reply } = createMockMessage({ isDm: false })

    await routeDirectMessage(message, deps)

    expect(deps.verifyDiscordUser).not.toHaveBeenCalled()
    expect(reply).not.toHaveBeenCalled()
  })

  it("nudges an unlinked user with the portal link and never chats", async () => {
    const deps = makeDeps({
      verifyDiscordUser: jest.fn().mockResolvedValue({ linked: false }),
    })
    const { message, reply } = createMockMessage({ content: "help me" })

    await routeDirectMessage(message, deps)

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("https://example.com/discord/link"),
      })
    )
    expect(deps.handleDiscordChat).not.toHaveBeenCalled()
    expect(deps.clearDiscordChat).not.toHaveBeenCalled()
  })

  it("clears the chat context on the `reset` keyword and confirms", async () => {
    const deps = makeDeps()
    const { message, reply } = createMockMessage({ content: "reset" })

    await routeDirectMessage(message, deps)

    expect(deps.clearDiscordChat).toHaveBeenCalledWith({
      discordUserId: "discord-user-1",
      channelId: "dm-channel-1",
    })
    expect(deps.handleDiscordChat).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("cleared") })
    )
  })

  it("clears the chat context on the `clear` keyword (case-insensitive, trimmed)", async () => {
    const deps = makeDeps()
    const { message, reply } = createMockMessage({ content: "  CLEAR  " })

    await routeDirectMessage(message, deps)

    expect(deps.clearDiscordChat).toHaveBeenCalledTimes(1)
    expect(deps.handleDiscordChat).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("cleared") })
    )
  })

  it("routes a normal message through handleDiscordChat and replies with the answer", async () => {
    const deps = makeDeps()
    const { message, reply } = createMockMessage({ content: "what is new?" })

    await routeDirectMessage(message, deps)

    expect(deps.handleDiscordChat).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: "discord-user-1",
        channelId: "dm-channel-1",
        message: "what is new?",
      })
    )
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: "Here is your answer." })
    )
  })

  it("records a CHAT audit log around a normal message", async () => {
    const deps = makeDeps()
    const { message } = createMockMessage({ content: "status?" })

    await routeDirectMessage(message, deps)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({
        discordUserId: "discord-user-1",
        commandType: "CHAT",
        channelType: "dm",
      })
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      "log-1",
      expect.objectContaining({ status: "SUCCESS" })
    )
  })

  it("records a CLEAR_CONTEXT audit log around a reset", async () => {
    const deps = makeDeps()
    const { message } = createMockMessage({ content: "reset" })

    await routeDirectMessage(message, deps)

    expect(mockCreate).toHaveBeenCalledWith(
      expect.objectContaining({ commandType: "CLEAR_CONTEXT" })
    )
    expect(mockUpdate).toHaveBeenCalledWith(
      "log-1",
      expect.objectContaining({ status: "SUCCESS" })
    )
  })

  it("surfaces a friendly error and records FAILED when the chat call throws", async () => {
    const deps = makeDeps({
      handleDiscordChat: jest.fn().mockRejectedValue(new Error("boom")),
    })
    const { message, reply } = createMockMessage({ content: "hi" })

    await routeDirectMessage(message, deps)

    expect(mockUpdate).toHaveBeenCalledWith(
      "log-1",
      expect.objectContaining({ status: "FAILED", error: "boom" })
    )
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("couldn't reach the assistant") })
    )
  })

  it("nudges when the chat result reports the user is not linked", async () => {
    const deps = makeDeps({
      handleDiscordChat: jest
        .fn()
        .mockResolvedValue({ success: false, linked: false, error: "not linked" }),
    })
    const { message, reply } = createMockMessage({ content: "hi" })

    await routeDirectMessage(message, deps)

    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({
        content: expect.stringContaining("https://example.com/discord/link"),
      })
    )
  })

  it("prompts for input when the message has no actionable content", async () => {
    const deps = makeDeps()
    const { message, reply } = createMockMessage({ content: "   " })

    await routeDirectMessage(message, deps)

    expect(deps.handleDiscordChat).not.toHaveBeenCalled()
    expect(reply).toHaveBeenCalledWith(
      expect.objectContaining({ content: expect.stringContaining("didn't catch") })
    )
  })
})
