import "server-only"

import type { ModelMessage } from "ai"

import { ASSISTANT_BUDGET_MESSAGE, ASSISTANT_BUDGET_UNAVAILABLE_MESSAGE, checkSpend } from "@/lib/llm/budget"
import { chatWithTools, type ChatTool, type UsagePromptMessage } from "@/lib/llm/chat"
import { createLogger } from "@/lib/utils/logger"
import { executeToolCall } from "./executors"
import { ALL_TOOLS } from "./tools"
import { type ChatMessage, type ChatResponse } from "./types"

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
   * True selects the admin daily spend cap; anything else the member cap.
   */
  isAdmin?: boolean
  systemPrompt: string
  tools?: ChatTool[]
  /** Output-token cap for each LLM call (the Discord context's 600, SEC-51). */
  maxOutputTokens?: number
}

/**
 * A tool's output as the model receives it: wrapped as `untrusted_data`, so
 * text that members and services control (display names, titles, error
 * bodies) reads as data and never as instructions (SEC-42). JSON output is
 * embedded as a value; anything else as a string.
 */
function asUntrustedData(output: string): string {
  let result: unknown = output
  try {
    result = JSON.parse(output)
  } catch {
    // Plain text, such as an "Error: ..." line, stays a string
  }
  return JSON.stringify({ untrusted_data: result })
}

interface ConversationResult {
  success: boolean
  message?: ChatMessage
  error?: string
  /** Set when a spend cap stopped the turn, or its check failed closed; `error` is then copy for the member. */
  refusal?: ChatResponse["refusal"]
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
  // What each call adds to the context, the only prompt text its usage row stores (SEC-45)
  let usagePrompt: UsagePromptMessage[] = [{ role: "user", content: messages.at(-1)?.content ?? "" }]

  while (loops < MAX_LOOPS) {
    loops++

    // Before every call, not once per message, so a tool loop stops at the cap (SEC-23)
    const spend = await checkSpend({ userId: config.userId, isAdmin: config.isAdmin === true })
    if (!spend.ok) {
      logger.warn("Assistant call refused by the daily spend cap", { userId: config.userId, scope: spend.scope, loops })
      return spend.scope === "unavailable"
        ? { success: false, refusal: "BUDGET_UNAVAILABLE", error: ASSISTANT_BUDGET_UNAVAILABLE_MESSAGE }
        : { success: false, refusal: "BUDGET_EXCEEDED", error: ASSISTANT_BUDGET_MESSAGE }
    }

    const response = await chatWithTools({
      system: config.systemPrompt,
      messages: history,
      tools: toolRegistry,
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      maxOutputTokens: config.maxOutputTokens,
      usagePrompt,
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
          value: asUntrustedData(await executeToolCall(toolCall, config.userId, config.context, config.isAdmin)),
        },
      }))
    )
    history.push({ role: "tool", content: toolResults })
    usagePrompt = toolResults.map((result) => ({ role: "tool", name: result.toolName, content: result.output.value }))
  }

  return {
    success: false,
    error: "Maximum conversation turns exceeded",
  }
}
