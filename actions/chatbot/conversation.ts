import { callChatLLM, type ChatTool, type ChatMessage as LLMChatMessage } from "@/lib/llm/chat"
import { calculateCost } from "@/lib/llm/pricing"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { executeToolCall } from "./executors"
import { TOOLS } from "./tools"
import { type ChatMessage } from "./types"

const logger = createLogger("CHATBOT_CONVERSATION")

interface ConversationConfig {
  userId: string
  conversationId: string
  context?: string
  /**
   * Whether the acting user is an app admin. Threaded through to the executor's
   * Discord admin-tier guard (Step 19, FR-14). Undefined → treated as non-admin
   * (fail-closed) in the Discord context; inert in the admin web context.
   */
  isAdmin?: boolean
  llmProvider: {
    apiKey: string
    model: string | null
    temperature: number | null
    maxTokens: number | null
  }
  systemPrompt: string
  tools?: ChatTool[]
}

interface ConversationResult {
  success: boolean
  message?: ChatMessage
  error?: string
}

export async function runConversationLoop(
  messages: ChatMessage[],
  config: ConversationConfig
): Promise<ConversationResult> {
  // Convert messages to LLM format
  let currentMessages: LLMChatMessage[] = [
    { role: "system", content: config.systemPrompt },
    ...messages.map((m) => ({ role: m.role as "user" | "assistant", content: m.content })),
  ]

  const toolRegistry = config.tools ?? TOOLS
  const MAX_LOOPS = 5
  let loops = 0
  const toolsUsed = new Set<string>() // Track which tools were called

  while (loops < MAX_LOOPS) {
    loops++

    if (!config.llmProvider.model) {
      logger.error("No model configured for chat LLM")
      return { success: false, error: "No model configured for chat assistant. Please configure a model in admin settings." }
    }

    const response = await callChatLLM(
      {
        provider: "openai",
        apiKey: config.llmProvider.apiKey,
        model: config.llmProvider.model,
        temperature: config.llmProvider.temperature || undefined,
        maxTokens: config.llmProvider.maxTokens || undefined,
      },
      currentMessages,
      toolRegistry
    )

    if (!response.success) {
      logger.error("LLM call failed", undefined, { error: response.error })
      return { success: false, error: "Failed to communicate with AI provider" }
    }

    // Log usage if available
    if (response.usage) {
      const cost = calculateCost(
        response.model,
        response.usage.prompt_tokens,
        response.usage.completion_tokens,
        "openai"
      )

      await prisma.lLMUsage.create({
        data: {
          userId: config.userId,
          chatConversationId: config.conversationId,
          provider: "openai",
          model: response.model || config.llmProvider.model || "unknown",
          prompt: JSON.stringify(currentMessages), // Store context as prompt
          response: response.content || JSON.stringify(response.toolCalls),
          promptTokens: response.usage.prompt_tokens,
          completionTokens: response.usage.completion_tokens,
          totalTokens: response.usage.total_tokens,
          cost,
          wrappedId: null, // Explicitly null for chatbot usage
        },
      })
    }

    // If we have content and no tool calls, we're done
    if (response.content && (!response.toolCalls || response.toolCalls.length === 0)) {
      // Build sources array from tools used
      const sources = Array.from(toolsUsed).map((toolName) => {
        const tool = toolRegistry.find((t) => t.function.name === toolName)
        return {
          tool: toolName,
          description: tool?.function.description || toolName,
        }
      })

      return {
        success: true,
        message: {
          role: "assistant",
          content: response.content,
          timestamp: Date.now(),
          sources: sources.length > 0 ? sources : undefined,
        },
      }
    }

    // If we have tool calls, execute them
    if (response.toolCalls && response.toolCalls.length > 0) {
      // Track which tools were called
      response.toolCalls.forEach((toolCall) => {
        toolsUsed.add(toolCall.function.name)
      })

      // Add the assistant's message with tool calls to history
      currentMessages.push({
        role: "assistant",
        content: response.content || null,
        tool_calls: response.toolCalls,
      })

      // Execute tools in parallel
      const toolResults = await Promise.all(
        response.toolCalls.map(async (toolCall) => {
          const result = await executeToolCall(toolCall, config.userId, config.context, config.isAdmin)
          return {
            role: "tool" as const,
            tool_call_id: toolCall.id,
            name: toolCall.function.name,
            content: result,
          }
        })
      )

      // Add tool results to history
      currentMessages.push(...toolResults)

      // Continue loop to get AI interpretation of tool results
      continue
    }

    // Should not reach here if logic is correct (either content or toolCalls)
    break
  }

  return {
    success: false,
    error: "Maximum conversation turns exceeded",
  }
}

