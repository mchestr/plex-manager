import type { ModelMessage } from "ai"

import { chatWithTools, type ChatTool } from "@/lib/llm/chat"
import { createLogger } from "@/lib/utils/logger"
import { executeToolCall } from "./executors"
import { ALL_TOOLS } from "./tools"
import { type ChatMessage } from "./types"

const logger = createLogger("CHATBOT_CONVERSATION")

// Per assistant turn, including retries
const REQUEST_TIMEOUT_MS = 30000

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
  systemPrompt: string
  tools?: ChatTool[]
  /** Output-token cap for each LLM call (the Discord context's 600, SEC-51). */
  maxOutputTokens?: number
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
  // Only the member's and the assistant's own turns; a client cannot add system text
  const history: ModelMessage[] = messages.flatMap((m): ModelMessage[] =>
    m.role === "user" || m.role === "assistant" ? [{ role: m.role, content: m.content }] : []
  )

  const toolRegistry = config.tools ?? ALL_TOOLS
  const MAX_LOOPS = 5
  let loops = 0
  const toolsUsed = new Set<string>() // Track which tools were called

  while (loops < MAX_LOOPS) {
    loops++

    const response = await chatWithTools({
      system: config.systemPrompt,
      messages: history,
      tools: toolRegistry,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      maxOutputTokens: config.maxOutputTokens,
      attribution: { userId: config.userId, chatConversationId: config.conversationId },
    })

    if (!response.ok) {
      logger.error("LLM call failed", undefined, { error: response.error })
      // A provider or model-choice problem tells the admin what to change; anything else stays generic
      return {
        success: false,
        error: response.configurationError ? response.error : "Failed to communicate with AI provider",
      }
    }

    // If we have content and no tool calls, we're done
    if (response.toolCalls.length === 0) {
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

    response.toolCalls.forEach((toolCall) => {
      toolsUsed.add(toolCall.function.name)
    })

    // The assistant turn as the provider returned it (with its reasoning), then the results
    history.push(...response.responseMessages)

    const toolResults = await Promise.all(
      response.toolCalls.map(async (toolCall) => ({
        type: "tool-result" as const,
        toolCallId: toolCall.id,
        toolName: toolCall.function.name,
        output: {
          type: "text" as const,
          value: await executeToolCall(toolCall, config.userId, config.context, config.isAdmin),
        },
      }))
    )
    history.push({ role: "tool", content: toolResults })
  }

  return {
    success: false,
    error: "Maximum conversation turns exceeded",
  }
}
