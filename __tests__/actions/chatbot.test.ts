/**
 * Tests for actions/chatbot.ts - chatbot sources tracking functionality
 */

import { chatWithAdminBot } from "@/actions/chatbot"
import { type ChatMessage } from "@/actions/chatbot/types"
import { callChatLLM } from "@/lib/llm/chat"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"

// Mock dependencies
jest.mock("@/lib/llm/chat", () => ({
  callChatLLM: jest.fn(),
}))

jest.mock("@/lib/prisma", () => ({
  prisma: {
    config: {
      findUnique: jest.fn(),
    },
    lLMProvider: {
      findFirst: jest.fn(),
    },
    lLMUsage: {
      create: jest.fn(),
    },
    chatConversation: {
      create: jest.fn(),
    },
    plexServer: {
      findFirst: jest.fn(),
    },
    sonarr: {
      findFirst: jest.fn(),
    },
    radarr: {
      findFirst: jest.fn(),
    },
    tautulli: {
      findFirst: jest.fn(),
    },
    overseerr: {
      findFirst: jest.fn(),
    },
  },
}))

jest.mock("@/lib/connections/plex", () => ({
  getPlexServerIdentity: jest.fn(),
  getPlexSessions: jest.fn(),
}))

jest.mock("@/lib/connections/sonarr", () => ({
  getSonarrSystemStatus: jest.fn(),
  getSonarrQueue: jest.fn(),
  getSonarrHealth: jest.fn(),
  getSonarrDiskSpace: jest.fn(),
  searchSonarrSeries: jest.fn(),
  getSonarrHistory: jest.fn(),
}))

jest.mock("@/lib/connections/radarr", () => ({
  getRadarrSystemStatus: jest.fn(),
  getRadarrQueue: jest.fn(),
  getRadarrHealth: jest.fn(),
  getRadarrDiskSpace: jest.fn(),
}))

jest.mock("@/lib/connections/tautulli", () => ({
  getTautulliServerInfo: jest.fn(),
  getTautulliActivity: jest.fn(),
}))

jest.mock("@/lib/connections/overseerr", () => ({
  getOverseerrStatus: jest.fn(),
  getOverseerrRequests: jest.fn(),
}))

jest.mock("@/lib/wrapped/pricing", () => ({
  calculateCost: jest.fn(() => 0.001),
}))

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  })),
}))

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

const mockCallChatLLM = callChatLLM as jest.MockedFunction<typeof callChatLLM>
const mockPrisma = prisma as jest.Mocked<typeof prisma>
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

describe("chatbot sources tracking", () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", name: "Test User", email: "test@example.com" },
    } as any)

    mockPrisma.config.findUnique.mockResolvedValue({
      llmDisabled: false,
    } as any)

    mockPrisma.lLMProvider.findFirst.mockResolvedValue({
      id: "provider-1",
      provider: "openai",
      apiKey: "test-key",
      model: "gpt-4",
      temperature: 0.7,
      maxTokens: 1000,
      isActive: true,
    } as any)

    // Mock chatConversation.create
    mockPrisma.chatConversation.create.mockResolvedValue({
      id: "conversation-1",
      userId: "user-1",
      createdAt: new Date(),
    } as any)

    // Mock lLMUsage.create
    mockPrisma.lLMUsage.create.mockResolvedValue({
      id: "usage-1",
      userId: "user-1",
      chatConversationId: "conversation-1",
      provider: "openai",
      model: "gpt-4",
      prompt_tokens: 100,
      completion_tokens: 50,
      total_tokens: 150,
      cost: 0.001,
    } as any)
  })

  describe("sources tracking when tools are used", () => {
    it("should include sources when a single tool is called", async () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Check Sonarr status",
          timestamp: Date.now(),
        },
      ]

      // Mock LLM response with tool call
      mockCallChatLLM.mockResolvedValueOnce({
        success: true,
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "get_sonarr_status",
              arguments: "{}",
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        model: "gpt-4",
      })

      // Mock tool execution result
      mockPrisma.sonarr.findFirst.mockResolvedValue({
        id: "sonarr-1",
        name: "Sonarr",
        url: "http://localhost:8989",
        apiKey: "test-key",
        publicUrl: null,
        isActive: true,
      } as any)

      const { getSonarrSystemStatus, getSonarrQueue, getSonarrHealth, getSonarrDiskSpace } =
        require("@/lib/connections/sonarr")
      ;(getSonarrSystemStatus as jest.Mock).mockResolvedValue({ version: "3.0.0" })
      ;(getSonarrQueue as jest.Mock).mockResolvedValue([])
      ;(getSonarrHealth as jest.Mock).mockResolvedValue([])
      ;(getSonarrDiskSpace as jest.Mock).mockResolvedValue([])

      // Mock final LLM response
      mockCallChatLLM.mockResolvedValueOnce({
        success: true,
        content: "Sonarr is running version 3.0.0",
        usage: {
          prompt_tokens: 200,
          completion_tokens: 30,
          total_tokens: 230,
        },
        model: "gpt-4",
      })

      const response = await chatWithAdminBot(messages)

      expect(response.success).toBe(true)
      expect(response.message?.sources).toBeDefined()
      expect(response.message?.sources).toHaveLength(1)
      expect(response.message?.sources?.[0].tool).toBe("get_sonarr_status")
      expect(response.message?.sources?.[0].description).toContain("Sonarr")
    })

    it("should include multiple sources when multiple tools are called", async () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Check Plex and Sonarr status",
          timestamp: Date.now(),
        },
      ]

      // Mock LLM response with multiple tool calls
      mockCallChatLLM.mockResolvedValueOnce({
        success: true,
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "get_plex_status",
              arguments: "{}",
            },
          },
          {
            id: "call-2",
            type: "function",
            function: {
              name: "get_sonarr_status",
              arguments: "{}",
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        model: "gpt-4",
      })

      // Mock Plex server
      mockPrisma.plexServer.findFirst.mockResolvedValue({
        id: "plex-1",
        name: "Plex",
        url: "http://localhost:32400",
        token: "test-token",
        publicUrl: null,
        isActive: true,
      } as any)

      const { getPlexServerIdentity } = require("@/lib/connections/plex")
      ;(getPlexServerIdentity as jest.Mock).mockResolvedValue({ machineIdentifier: "test-id" })

      // Mock Sonarr server
      mockPrisma.sonarr.findFirst.mockResolvedValue({
        id: "sonarr-1",
        name: "Sonarr",
        url: "http://localhost:8989",
        apiKey: "test-key",
        publicUrl: null,
        isActive: true,
      } as any)

      const { getSonarrSystemStatus, getSonarrQueue, getSonarrHealth, getSonarrDiskSpace } =
        require("@/lib/connections/sonarr")
      ;(getSonarrSystemStatus as jest.Mock).mockResolvedValue({ version: "3.0.0" })
      ;(getSonarrQueue as jest.Mock).mockResolvedValue([])
      ;(getSonarrHealth as jest.Mock).mockResolvedValue([])
      ;(getSonarrDiskSpace as jest.Mock).mockResolvedValue([])

      // Mock final LLM response
      mockCallChatLLM.mockResolvedValueOnce({
        success: true,
        content: "Both Plex and Sonarr are running",
        usage: {
          prompt_tokens: 200,
          completion_tokens: 30,
          total_tokens: 230,
        },
        model: "gpt-4",
      })

      const response = await chatWithAdminBot(messages)

      expect(response.success).toBe(true)
      expect(response.message?.sources).toBeDefined()
      expect(response.message?.sources).toHaveLength(2)
      expect(response.message?.sources?.map((s) => s.tool)).toContain("get_plex_status")
      expect(response.message?.sources?.map((s) => s.tool)).toContain("get_sonarr_status")
    })

    it("should not include sources when no tools are called", async () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Hello, how are you?",
          timestamp: Date.now(),
        },
      ]

      // Mock LLM response without tool calls
      mockCallChatLLM.mockResolvedValueOnce({
        success: true,
        content: "I'm doing well, thank you!",
        usage: {
          prompt_tokens: 50,
          completion_tokens: 10,
          total_tokens: 60,
        },
        model: "gpt-4",
      })

      const response = await chatWithAdminBot(messages)

      expect(response.success).toBe(true)
      expect(response.message?.sources).toBeUndefined()
    })

    it("should track sources across multiple tool call iterations", async () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Check Sonarr history and then search for a show",
          timestamp: Date.now(),
        },
      ]

      // First LLM call - requests history
      mockCallChatLLM.mockResolvedValueOnce({
        success: true,
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "get_sonarr_history",
              arguments: '{"pageSize": 20}',
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        model: "gpt-4",
      })

      // Mock Sonarr server and history
      mockPrisma.sonarr.findFirst.mockResolvedValue({
        id: "sonarr-1",
        name: "Sonarr",
        url: "http://localhost:8989",
        apiKey: "test-key",
        publicUrl: null,
        isActive: true,
      } as any)

      const { getSonarrHistory, searchSonarrSeries } = require("@/lib/connections/sonarr")
      ;(getSonarrHistory as jest.Mock).mockResolvedValue([])

      // Second LLM call - requests search after seeing history
      mockCallChatLLM.mockResolvedValueOnce({
        success: true,
        toolCalls: [
          {
            id: "call-2",
            type: "function",
            function: {
              name: "search_sonarr_series",
              arguments: '{"term": "Breaking Bad"}',
            },
          },
        ],
        usage: {
          prompt_tokens: 200,
          completion_tokens: 50,
          total_tokens: 250,
        },
        model: "gpt-4",
      })

      ;(searchSonarrSeries as jest.Mock).mockResolvedValue([])

      // Final LLM response
      mockCallChatLLM.mockResolvedValueOnce({
        success: true,
        content: "I checked the history and searched for the show",
        usage: {
          prompt_tokens: 300,
          completion_tokens: 30,
          total_tokens: 330,
        },
        model: "gpt-4",
      })

      const response = await chatWithAdminBot(messages)

      expect(response.success).toBe(true)
      expect(response.message?.sources).toBeDefined()
      expect(response.message?.sources).toHaveLength(2)
      expect(response.message?.sources?.map((s) => s.tool)).toContain("get_sonarr_history")
      expect(response.message?.sources?.map((s) => s.tool)).toContain("search_sonarr_series")
    })

    it("should include correct tool descriptions in sources", async () => {
      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Get Plex sessions",
          timestamp: Date.now(),
        },
      ]

      mockCallChatLLM.mockResolvedValueOnce({
        success: true,
        toolCalls: [
          {
            id: "call-1",
            type: "function",
            function: {
              name: "get_plex_sessions",
              arguments: "{}",
            },
          },
        ],
        usage: {
          prompt_tokens: 100,
          completion_tokens: 50,
          total_tokens: 150,
        },
        model: "gpt-4",
      })

      mockPrisma.plexServer.findFirst.mockResolvedValue({
        id: "plex-1",
        name: "Plex",
        url: "http://localhost:32400",
        token: "test-token",
        publicUrl: null,
        isActive: true,
      } as any)

      const { getPlexSessions } = require("@/lib/connections/plex")
      ;(getPlexSessions as jest.Mock).mockResolvedValue([])

      mockCallChatLLM.mockResolvedValueOnce({
        success: true,
        content: "No active sessions",
        usage: {
          prompt_tokens: 200,
          completion_tokens: 20,
          total_tokens: 220,
        },
        model: "gpt-4",
      })

      const response = await chatWithAdminBot(messages)

      expect(response.success).toBe(true)
      expect(response.message?.sources).toBeDefined()
      expect(response.message?.sources?.[0].tool).toBe("get_plex_sessions")
      expect(response.message?.sources?.[0].description).toContain("sessions")
    })
  })

  describe("LLM disabled scenarios", () => {
    it("should return disabled message when LLM is disabled and not call OpenAI", async () => {
      mockPrisma.config.findUnique.mockResolvedValue({
        llmDisabled: true,
      } as any)

      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Check Plex status",
          timestamp: Date.now(),
        },
      ]

      const response = await chatWithAdminBot(messages)

      expect(response.success).toBe(true)
      expect(response.message?.content).toContain("AI features are currently disabled")
      expect(response.message?.content).toContain("configure a chat OpenAI model")
      expect(mockCallChatLLM).not.toHaveBeenCalled()
      expect(mockPrisma.chatConversation.create).not.toHaveBeenCalled()
    })

    it("should return disabled message when LLM is disabled even with provider configured", async () => {
      mockPrisma.config.findUnique.mockResolvedValue({
        llmDisabled: true,
      } as any)

      // Even if provider exists, should not use it
      mockPrisma.lLMProvider.findFirst.mockResolvedValue({
        id: "provider-1",
        provider: "openai",
        apiKey: "test-key",
        model: "gpt-4",
        isActive: true,
      } as any)

      const messages: ChatMessage[] = [
        {
          role: "user",
          content: "Hello",
          timestamp: Date.now(),
        },
      ]

      const response = await chatWithAdminBot(messages)

      expect(response.success).toBe(true)
      expect(response.message?.content).toContain("AI features are currently disabled")
      expect(mockCallChatLLM).not.toHaveBeenCalled()
    })
  })
})

