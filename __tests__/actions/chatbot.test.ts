/**
 * Tests for actions/chatbot.ts - chatbot sources tracking functionality
 */

import { chatWithAdminBot } from "@/actions/chatbot"
import { type ChatMessage } from "@/actions/chatbot/types"
import { callChatLLM, RESPONSES_API_TOOLS_ERROR } from "@/lib/llm/chat"
import { getServerSession } from "next-auth"
import { mockReset } from 'jest-mock-extended'
import { prismaMock } from '@/__tests__/helpers/prisma-mock'

// Mock dependencies
jest.mock("@/lib/llm/chat", () => ({
  ...jest.requireActual("@/lib/llm/chat"),
  callChatLLM: jest.fn(),
}))

jest.mock('@/lib/prisma', () => require('@/__tests__/helpers/prisma-mock').prismaModule)

beforeEach(() => mockReset(prismaMock))

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

jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({
    debug: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
  })),
}))

jest.mock("next-auth", () => ({
  getServerSession: jest.fn(),
}))

const mockCallChatLLM = callChatLLM as jest.MockedFunction<typeof callChatLLM>
const mockPrisma = prismaMock
const mockGetServerSession = getServerSession as jest.MockedFunction<typeof getServerSession>

describe("chatbot sources tracking", () => {
  beforeEach(() => {
    jest.clearAllMocks()

    mockGetServerSession.mockResolvedValue({
      user: { id: "user-1", name: "Test User", email: "test@example.com", isAdmin: true },
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

  describe("model-dependent tool calls (real OpenAI client, mocked fetch)", () => {
    const { callChatLLM: realCallChatLLM } =
      jest.requireActual<typeof import("@/lib/llm/chat")>("@/lib/llm/chat")
    const fetchMock = jest.fn()
    const originalFetch = global.fetch

    const messages: ChatMessage[] = [
      { role: "user", content: "Check Sonarr status", timestamp: Date.now() },
    ]

    function useChatModel(model: string) {
      mockPrisma.lLMProvider.findFirst.mockResolvedValue({
        id: "provider-1",
        provider: "openai",
        apiKey: "test-key",
        model,
        temperature: 0.7,
        maxTokens: 1000,
        isActive: true,
      } as any)
    }

    beforeEach(() => {
      mockCallChatLLM.mockImplementation(realCallChatLLM)
      fetchMock.mockReset()
      global.fetch = fetchMock
    })

    afterAll(() => {
      mockCallChatLLM.mockReset()
      global.fetch = originalFetch
    })

    it("returns the Responses API error for tools on gpt-6.1-sol without calling the API", async () => {
      useChatModel("gpt-6.1-sol")

      const response = await chatWithAdminBot(messages)

      expect(response.success).toBe(false)
      expect(response.error).toBe(RESPONSES_API_TOOLS_ERROR)
      expect(response.error).toContain("Responses API")
      expect(fetchMock).not.toHaveBeenCalled()
      expect(mockPrisma.lLMUsage.create).not.toHaveBeenCalled()
    })

    it("sends reasoning_effort none with tools on gpt-6-luna, and no temperature", async () => {
      useChatModel("gpt-6-luna")
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          model: "gpt-6-luna-2026-09-22",
          choices: [{ message: { content: "All services are healthy" }, finish_reason: "stop" }],
          usage: {
            prompt_tokens: 1000,
            completion_tokens: 100,
            total_tokens: 1100,
            prompt_tokens_details: { cached_tokens: 400 },
          },
        }),
      })

      const response = await chatWithAdminBot(messages)

      expect(response.success).toBe(true)
      expect(fetchMock).toHaveBeenCalledTimes(1)
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.model).toBe("gpt-6-luna")
      expect(body.tools.length).toBeGreaterThan(0)
      expect(body.reasoning_effort).toBe("none")
      expect(body.max_completion_tokens).toBe(1000)
      expect(body).not.toHaveProperty("temperature")
      expect(body).not.toHaveProperty("max_tokens")

      // The served model is recorded, and cached tokens are priced at the cached rate:
      // 600 at $0.10/1M + 400 at $0.01/1M + 100 at $0.50/1M
      const usage = (mockPrisma.lLMUsage.create as jest.Mock).mock.calls[0][0].data
      expect(usage.model).toBe("gpt-6-luna-2026-09-22")
      expect(usage.cost).toBeCloseTo(0.00006 + 0.000004 + 0.00005, 12)
    })

    it("keeps temperature and max_tokens with tools on gpt-4o", async () => {
      useChatModel("gpt-4o")
      fetchMock.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          choices: [{ message: { content: "Done" }, finish_reason: "stop" }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      })

      const response = await chatWithAdminBot(messages)

      expect(response.success).toBe(true)
      const body = JSON.parse(fetchMock.mock.calls[0][1].body)
      expect(body.temperature).toBe(0.7)
      expect(body.max_tokens).toBe(1000)
      expect(body).not.toHaveProperty("reasoning_effort")
    })

    it("keeps other API failures generic", async () => {
      useChatModel("gpt-5.4-mini")
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: "Bad Request",
        json: async () => ({ error: { message: "Internal upstream detail" } }),
      })

      const response = await chatWithAdminBot(messages)

      expect(response.success).toBe(false)
      expect(response.error).toBe("Failed to communicate with AI provider")
    })
  })
})
