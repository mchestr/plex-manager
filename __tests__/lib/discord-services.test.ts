/**
 * Tests for lib/discord/services.ts - Discord chat functionality
 */

import { handleDiscordChat } from "@/lib/discord/services"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { getOrCreateSession, appendTurn } from "@/lib/discord/chat-session"
import { prisma } from "@/lib/prisma"

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

jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordConnection: {
      findUnique: jest.fn(),
    },
    config: {
      findUnique: jest.fn(),
    },
  },
}))

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
const mockPrisma = prisma as jest.Mocked<typeof prisma>

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
      subscription: null,
    },
  }

  const mockResolvedSession = {
    id: "session-1",
    chatConversationId: "conversation-1",
    history: [],
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
        user: { id: "user-1", isAdmin: true },
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
        user: { id: "user-1", isAdmin: false, isExempt: false, subscription: null },
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

    it("allows an ACTIVE subscriber when Stripe gating is on", async () => {
      mockPrisma.config.findUnique.mockResolvedValue({ stripeEnabled: true } as any)
      mockPrisma.discordConnection.findUnique.mockResolvedValue({
        ...mockConnection,
        user: {
          id: "user-1",
          isAdmin: false,
          isExempt: false,
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
        user: { id: "user-1", isAdmin: false, isExempt: true, subscription: null },
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
})

