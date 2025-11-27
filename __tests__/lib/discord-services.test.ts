/**
 * Tests for lib/discord/services.ts - Discord chat functionality
 */

import { handleDiscordChat } from "@/lib/discord/services"
import { runChatbotForUser } from "@/lib/chatbot/assistant"
import { prisma } from "@/lib/prisma"

// Mock dependencies
jest.mock("@/lib/chatbot/assistant", () => ({
  runChatbotForUser: jest.fn(),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    discordConnection: {
      findUnique: jest.fn(),
    },
    discordChatSession: {
      findUnique: jest.fn(),
      upsert: jest.fn(),
      update: jest.fn(),
    },
    chatConversation: {
      create: jest.fn(),
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
    },
  }

  const mockSession = {
    id: "session-1",
    discordUserId: "discord-123",
    discordChannelId: "channel-123",
    chatConversationId: "conversation-1",
    messages: [],
    isActive: true,
    lastMessageAt: new Date(),
  }

  beforeEach(() => {
    jest.clearAllMocks()
    mockPrisma.discordConnection.findUnique.mockResolvedValue(mockConnection as any)
    mockPrisma.discordChatSession.findUnique.mockResolvedValue(mockSession as any)
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
      })
    })

    it("should handle expired session when LLM is disabled", async () => {
      const expiredSession = {
        ...mockSession,
        isActive: false,
        lastMessageAt: new Date(Date.now() - 1000000), // Very old
      }

      mockPrisma.discordChatSession.findUnique.mockResolvedValue(expiredSession as any)
      mockPrisma.chatConversation.create.mockResolvedValue({
        id: "new-conversation-1",
        userId: "user-1",
        createdAt: new Date(),
      } as any)

      mockPrisma.discordChatSession.upsert.mockResolvedValue({
        ...mockSession,
        chatConversationId: "new-conversation-1",
      } as any)

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
      expect(mockPrisma.chatConversation.create).toHaveBeenCalled()
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
})

