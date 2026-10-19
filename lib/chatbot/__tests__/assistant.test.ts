/**
 * runChatbotForUser caps the Discord context's output at 600 tokens per LLM
 * call (P4.19, SEC-51); the admin context keeps the provider row's own cap.
 */

import { mockReset } from "jest-mock-extended"
import { prismaMock } from "@/__tests__/helpers/prisma-mock"
import { buildConfig } from "@/__tests__/helpers/factories"
import { chatWithTools } from "@/lib/llm/chat"
import { runChatbotForUser } from "../assistant"

jest.mock("@/lib/prisma", () => require("@/__tests__/helpers/prisma-mock").prismaModule)
jest.mock("@/lib/llm/chat", () => ({ chatWithTools: jest.fn() }))
jest.mock("@/lib/utils/logger", () => ({
  createLogger: jest.fn(() => ({ debug: jest.fn(), error: jest.fn(), info: jest.fn(), warn: jest.fn() })),
}))

const mockChatWithTools = chatWithTools as jest.MockedFunction<typeof chatWithTools>

beforeEach(() => {
  mockReset(prismaMock)
  mockChatWithTools.mockReset()
  prismaMock.config.findUnique.mockResolvedValue(buildConfig({ llmDisabled: false }))
  prismaMock.lLMProvider.findFirst.mockResolvedValue({ id: "provider-1" } as never)
  mockChatWithTools.mockResolvedValue({
    ok: true,
    content: "All good.",
    toolCalls: [],
    responseMessages: [],
    usage: { inputTokens: 1, cachedInputTokens: 0, cacheWriteTokens: 0, outputTokens: 1, reasoningTokens: 0 },
    modelId: "gpt-4o",
  })
})

const messages = [{ role: "user" as const, content: "what's playing?", timestamp: 0 }]

describe("runChatbotForUser output cap", () => {
  it("caps each Discord LLM call at 600 output tokens", async () => {
    const result = await runChatbotForUser({ userId: "user-1", messages, conversationId: "conv-1", context: "discord" })

    expect(result.success).toBe(true)
    expect(mockChatWithTools).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: 600 }))
  })

  it("leaves the admin context to the provider row's cap", async () => {
    await runChatbotForUser({ userId: "user-1", messages, conversationId: "conv-1", context: "default" })

    expect(mockChatWithTools).toHaveBeenCalledWith(expect.objectContaining({ maxOutputTokens: undefined }))
  })
})
