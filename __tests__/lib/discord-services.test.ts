/**
 * Tests for lib/discord/services.ts - Discord chat functionality
 */

import { handleDiscordChat } from "@/lib/discord/services"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { getOrCreateSession, appendTurn } from "@/lib/discord/chat-session"
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'
import { buildConfig } from '@/__tests__/helpers/factories'

// Mock dependencies
jest.mock("@/lib/chatbot/assistant", () => ({
  runChatbotForUser: jest.fn(),
}))

// Session resolution + history persistence are delegated to chat-session
// (unit-tested separately in lib/discord/__tests__/chat-session.test.ts). Here
// we mock it so these remain orchestration-level tests of handleDiscordChat.
jest.mock("@/lib/discord/chat-session", () => ({
  getOrCreateSession: jest.fn(),
  appendTurn: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

jest.mock("@/lib/discord/chat-safety", () => ({
  sanitizeDiscordResponse: jest.fn((content: string) => ({
    content,
    redacted: false,
  })),
}))

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

const mockRunChatbotForUser = runChatbotForUser as jest.MockedFunction<typeof runChatbotForUser>
const mockGetOrCreateSession = getOrCreateSession as jest.MockedFunction<typeof getOrCreateSession>
const mockAppendTurn = appendTurn as jest.MockedFunction<typeof appendTurn>
const mockPrisma = prismaMock

describe("handleDiscordChat: the assistant disclosure (P11.16)", () => {
  const connection = {
    id: "connection-1",
    discordUserId: "discord-123",
    userId: "user-1",
    linkedAt: new Date(),
    revokedAt: null,
    user: { id: "user-1", isAdmin: false, isExempt: false, disabledAt: null, subscription: null },
  }
  const DISCLOSURE = "Server admins can review assistant conversations, and messages are processed by Anthropic."

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.discordConnection.findUnique.mockResolvedValue(connection as any)
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: false } as any)
    mockPrisma.lLMProvider.findFirst.mockResolvedValue({ provider: "anthropic" } as any)
    mockAppendTurn.mockResolvedValue(undefined)
    mockRunChatbotForUser.mockResolvedValue({
      success: true,
      message: { role: "assistant", content: "Plex is up.", timestamp: Date.now() },
      conversationId: "conversation-1",
    })
  })

  const ask = () => handleDiscordChat({ discordUserId: "discord-123", channelId: "channel-123", message: "Is Plex up?" })

  it("leads the first reply of a new session with the disclosure, and keeps it out of the history", async () => {
    mockGetOrCreateSession.mockResolvedValue({ id: "session-1", chatConversationId: "conversation-1", history: [], created: true })

    const result = await ask()

    expect(result.message?.content).toBe(`_${DISCLOSURE}_\n\nPlex is up.`)
    expect(mockAppendTurn).toHaveBeenCalledWith(
      expect.objectContaining({ assistantMessage: expect.objectContaining({ content: "Plex is up." }) })
    )
  })

  it("leaves the second reply of the session alone", async () => {
    mockGetOrCreateSession.mockResolvedValue({ id: "session-1", chatConversationId: "conversation-1", history: [], created: false })

    const result = await ask()

    expect(result.message?.content).toBe("Plex is up.")
    expect(mockPrisma.lLMProvider.findFirst).not.toHaveBeenCalled()
  })
})

describe("handleDiscordChat", () => {
  const mockConnection = {
    id: "connection-1",
    discordUserId: "discord-123",
    userId: "user-1",
    linkedAt: new Date(),
    revokedAt: null,
    user: {
      id: "user-1",
      isAdmin: false,
      isExempt: false,
      disabledAt: null,
      subscription: null,
    },
  }

  const mockResolvedSession = {
    id: "session-1",
    chatConversationId: "conversation-1",
    history: [],
    created: false,
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.discordConnection.findUnique.mockResolvedValue(mockConnection as any)
    // Default: Stripe gating OFF → every linked user is entitled (today's behavior).
    mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: false } as any)
    mockGetOrCreateSession.mockResolvedValue(mockResolvedSession)
    mockAppendTurn.mockResolvedValue(undefined)
  })

  describe("LLM disabled scenarios", () => {
    it("should return disabled message when LLM is disabled and not call OpenAI", async () => {
      mockRunChatbotForUser.mockResolvedValue({
        success: true,
        message: {
          role: "assistant",
          content:
            "AI features are currently disabled or not configured. Please configure a chat OpenAI model in Settings to use the troubleshooting assistant.",
          timestamp: Date.now(),
        },
      })

      const result = await handleDiscordChat({
        discordUserId: "discord-123",
        channelId: "channel-123",
        message: "Check Plex status",
      })

      expect(result.success).toBe(true)
      expect(result.linked).toBe(true)
      expect(result.message?.content).toContain("AI features are currently disabled")
      expect(mockRunChatbotForUser).toHaveBeenCalledWith({
        userId: "user-1",
        messages: expect.arrayContaining([
          expect.objectContaining({
            role: "user",
            content: "Check Plex status",
          }),
        ]),
        conversationId: "conversation-1",
        context: "discord",
        isAdmin: false,
      })
    })

    it("should handle expired session when LLM is disabled", async () => {
      // An idle-expired session resolves (inside getOrCreateSession) to a fresh
      // conversation with empty history.
      mockGetOrCreateSession.mockResolvedValue({
        id: "session-1",
        chatConversationId: "new-conversation-1",
        history: [],
        created: true,
      })

      mockRunChatbotForUser.mockResolvedValue({
        success: true,
        message: {
          role: "assistant",
          content:
            "AI features are currently disabled or not configured. Please configure a chat OpenAI model in Settings to use the troubleshooting assistant.",
          timestamp: Date.now(),
        },
        conversationId: "new-conversation-1",
      })

      const result = await handleDiscordChat({
        discordUserId: "discord-123",
        channelId: "channel-123",
        message: "Hello",
      })

      expect(result.success).toBe(true)
      expect(result.linked).toBe(true)
      expect(result.message?.content).toContain("AI features are currently disabled")
      expect(result.conversationId).toBe("new-conversation-1")
      expect(mockGetOrCreateSession).toHaveBeenCalledWith({
        discordUserId: "discord-123",
        channelId: "channel-123",
        userId: "user-1",
      })
    })
  })

  describe("admin tier threading (Step 19, FR-14)", () => {
    it("threads the linked user's isAdmin=false into runChatbotForUser", async () => {
      mockRunChatbotForUser.mockResolvedValue({
        success: true,
        message: { role: "assistant", content: "ok", timestamp: Date.now() },
      })

      await handleDiscordChat({
        discordUserId: "discord-123",
        channelId: "channel-123",
        message: "queue status?",
      })

      expect(mockRunChatbotForUser).toHaveBeenCalledWith(
        expect.objectContaining({ context: "discord", isAdmin: false })
      )
    })

    it("threads isAdmin=true when the linked user is an admin", async () => {
      mockPrisma.discordConnection.findUnique.mockResolvedValue({
        ...mockConnection,
        user: { ...mockConnection.user, isAdmin: true },
      } as any)
      mockRunChatbotForUser.mockResolvedValue({
        success: true,
        message: { role: "assistant", content: "ok", timestamp: Date.now() },
      })

      await handleDiscordChat({
        discordUserId: "discord-123",
        channelId: "channel-123",
        message: "queue status?",
      })

      expect(mockRunChatbotForUser).toHaveBeenCalledWith(
        expect.objectContaining({ context: "discord", isAdmin: true })
      )
    })
  })

  describe("error handling", () => {
    it("should return error when Discord account is not linked", async () => {
      mockPrisma.discordConnection.findUnique.mockResolvedValue(null)

      const result = await handleDiscordChat({
        discordUserId: "discord-123",
        channelId: "channel-123",
        message: "Hello",
      })

      expect(result.success).toBe(false)
      expect(result.linked).toBe(false)
      expect(result.error).toContain("not linked")
      expect(mockRunChatbotForUser).not.toHaveBeenCalled()
    })

    it("should return error when Discord account is revoked", async () => {
      const revokedConnection = {
        ...mockConnection,
        revokedAt: new Date(),
      }
      mockPrisma.discordConnection.findUnique.mockResolvedValue(revokedConnection as any)

      const result = await handleDiscordChat({
        discordUserId: "discord-123",
        channelId: "channel-123",
        message: "Hello",
      })

      expect(result.success).toBe(false)
      expect(result.linked).toBe(false)
      expect(mockRunChatbotForUser).not.toHaveBeenCalled()
    })

    it("should return error when chatbot fails", async () => {
      mockRunChatbotForUser.mockResolvedValue({
        success: false,
        error: "Chatbot error",
      })

      const result = await handleDiscordChat({
        discordUserId: "discord-123",
        channelId: "channel-123",
        message: "Hello",
      })

      expect(result.success).toBe(false)
      expect(result.linked).toBe(true)
      expect(result.error).toBe("Chatbot error")
    })
  })

  describe("subscription entitlement gate", () => {
    it("blocks a linked but non-subscribed user when Stripe gating is on", async () => {
      mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: true } as any)
      mockPrisma.discordConnection.findUnique.mockResolvedValue({
        ...mockConnection,
        user: { id: "user-1", isAdmin: false, isExempt: false, disabledAt: null, subscription: null },
      } as any)

      const result = await handleDiscordChat({
        discordUserId: "discord-123",
        channelId: "channel-123",
        message: "Check Plex status",
      })

      expect(result.success).toBe(false)
      expect(result.linked).toBe(true)
      expect(result.entitled).toBe(false)
      // Critically: the assistant / its tools are never invoked for a non-sub.
      expect(mockRunChatbotForUser).not.toHaveBeenCalled()
      expect(mockGetOrCreateSession).not.toHaveBeenCalled()
    })

    it("blocks a disabled user even when Stripe gating is off", async () => {
      mockPrisma.discordConnection.findUnique.mockResolvedValue({
        ...mockConnection,
        user: { id: "user-1", isAdmin: true, isExempt: false, disabledAt: new Date(), subscription: null },
      } as never)

      const result = await handleDiscordChat({
        discordUserId: "discord-123",
        channelId: "channel-123",
        message: "Check Plex status",
      })

      expect(result.entitled).toBe(false)
      expect(mockRunChatbotForUser).not.toHaveBeenCalled()
    })

    it("allows an ACTIVE subscriber when Stripe gating is on", async () => {
      mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: true } as any)
      mockPrisma.discordConnection.findUnique.mockResolvedValue({
        ...mockConnection,
        user: {
          id: "user-1",
          isAdmin: false,
          isExempt: false,
          disabledAt: null,
          subscription: { status: "ACTIVE" },
        },
      } as any)
      mockRunChatbotForUser.mockResolvedValue({
        success: true,
        message: { role: "assistant", content: "ok", timestamp: Date.now() },
      })

      const result = await handleDiscordChat({
        discordUserId: "discord-123",
        channelId: "channel-123",
        message: "Check Plex status",
      })

      expect(result.success).toBe(true)
      expect(mockRunChatbotForUser).toHaveBeenCalled()
    })

    it("allows an exempt user with no subscription when gating is on", async () => {
      mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: true } as any)
      mockPrisma.discordConnection.findUnique.mockResolvedValue({
        ...mockConnection,
        user: { id: "user-1", isAdmin: false, isExempt: true, disabledAt: null, subscription: null },
      } as any)
      mockRunChatbotForUser.mockResolvedValue({
        success: true,
        message: { role: "assistant", content: "ok", timestamp: Date.now() },
      })

      const result = await handleDiscordChat({
        discordUserId: "discord-123",
        channelId: "channel-123",
        message: "hi",
      })

      expect(result.success).toBe(true)
      expect(mockRunChatbotForUser).toHaveBeenCalled()
    })
  })

  describe("message limits and spend caps (P4.20)", () => {
    const answer = {
      success: true,
      message: { role: "assistant" as const, content: "ok", timestamp: Date.now() },
    }

    function connectionFor(userId: string) {
      // A full row plus the included user, as the handler's query returns it
      const row = {
        ...mockConnection,
        userId,
        username: "member",
        discriminator: null,
        globalName: null,
        avatar: null,
        accessToken: "token",
        refreshToken: null,
        scope: null,
        expiresAt: null,
        metadataSyncedAt: null,
        lastWatchedHours: null,
        lastError: null,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        user: { ...mockConnection.user, id: userId },
      }
      mockPrisma.discordConnection.findUnique.mockResolvedValue(row)
    }

    const chat = () => handleDiscordChat({ discordUserId: "discord-123", channelId: "channel-123", message: "hi" })

    it("refuses the 21st message in an hour with the reset time, without an LLM call", async () => {
      connectionFor("chatty-member")
      mockRunChatbotForUser.mockResolvedValue(answer)

      for (let i = 0; i < 20; i++) {
        expect((await chat()).success).toBe(true)
      }
      mockRunChatbotForUser.mockClear()
      const result = await chat()

      expect(result).toMatchObject({ success: false, linked: true })
      expect(result.refusal).toMatch(/^You've reached the assistant's message limit\. You can ask again in \d+ (hour|minute)s?\.$/)
      expect(result.refusal).not.toMatch(/couldn't reach/)
      expect(mockRunChatbotForUser).not.toHaveBeenCalled()
    })

    it("does not spend a limit point for a member who is not entitled", async () => {
      mockPrisma.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: true }))
      connectionFor("lapsed-member")

      for (let i = 0; i < 25; i++) await chat()
      mockPrisma.config.findUnique.mockResolvedValue(buildConfig({ stripeEnabled: false }))
      mockRunChatbotForUser.mockResolvedValue(answer)

      expect((await chat()).success).toBe(true)
    })

    it("passes a spend-cap refusal on as the reply", async () => {
      connectionFor("capped-member")
      mockRunChatbotForUser.mockResolvedValue({
        success: false,
        refusal: "BUDGET_EXCEEDED",
        error: "I've hit today's assistant budget. It resets at midnight server time.",
        conversationId: "conversation-1",
      })

      const result = await chat()

      expect(result).toMatchObject({
        success: false,
        linked: true,
        refusal: "I've hit today's assistant budget. It resets at midnight server time.",
      })
      expect(mockAppendTurn).not.toHaveBeenCalled()
    })
  })
})
