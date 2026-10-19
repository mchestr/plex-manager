import "server-only"

import { APICallError, generateText, jsonSchema, RetryError, tool, type JSONSchema7, type ModelMessage, type ToolSet } from "ai"

import { providerOptionsFor, rowEffort } from "@/lib/llm/generate-structured"
import { costUsd, lookupModel, type TokenUsage } from "@/lib/llm/models"
import { getLanguageModel, LLMConfigError } from "@/lib/llm/registry"
import { recordUsage, type UsageAttribution } from "@/lib/llm/usage"
import { createLogger } from "@/lib/utils/logger"

/**
 * One assistant turn with tools, on the chat purpose's provider row.
 *
 * ## Overview
 *
 * `chatWithTools` sends the conversation and the tool definitions, and
 * returns the model's text and tool calls. It never runs a tool: the tools
 * carry no `execute`, so the caller (`actions/chatbot/conversation.ts`) keeps
 * its own loop and executors, and appends `responseMessages` plus its tool
 * results before the next turn. `responseMessages` keeps the provider's
 * reasoning parts, which Claude and the OpenAI reasoning models need back on
 * the turn after a tool call.
 *
 * Every billed call writes one usage row through `recordUsage`.
 *
 * @module lib/llm/chat
 */

const logger = createLogger("CHAT_LLM")

/** A tool as the chatbot registry defines it (OpenAI function-tool shape). */
export interface ChatTool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

/** A tool call in the shape the chatbot executors take. */
export interface ChatToolCall {
  id: string
  type: "function"
  function: {
    name: string
    /** JSON text of the call's input. */
    arguments: string
  }
}

export interface ChatWithToolsInput {
  system: string
  messages: ModelMessage[]
  tools: ChatTool[]
  signal?: AbortSignal
  attribution: UsageAttribution
  /** A cap on output tokens below the provider row's own `maxTokens` (the Discord context's 600). */
  maxOutputTokens?: number
}

export type ChatWithToolsResult =
  | {
      ok: true
      content: string
      toolCalls: ChatToolCall[]
      /** The assistant message(s) to append to the history as is. */
      responseMessages: ModelMessage[]
      usage: TokenUsage
      modelId: string
    }
  | {
      ok: false
      error: string
      /** The error is the admin's provider or model choice, so its message is safe to show. */
      configurationError?: boolean
    }

/**
 * The SDK tool set: name, description and JSON schema only. The registry's
 * Discord metadata (`discordSafe`, `discordFields`…) never reaches a provider.
 *
 * @internal
 */
export function toToolSet(tools: ChatTool[]): ToolSet {
  return Object.fromEntries(
    tools.map(({ function: fn }) => [
      fn.name,
      tool({ description: fn.description, inputSchema: jsonSchema(fn.parameters as JSONSchema7) }),
    ])
  )
}

/** The smaller of two optional token caps. */
function capTokens(rowCap: number | null, inputCap: number | undefined): number | undefined {
  if (rowCap === null) return inputCap
  return inputCap === undefined ? rowCap : Math.min(rowCap, inputCap)
}

/** Run one assistant turn. Never throws. */
export async function chatWithTools(input: ChatWithToolsInput): Promise<ChatWithToolsResult> {
  let resolved
  try {
    resolved = await getLanguageModel("chat")
  } catch (error) {
    if (error instanceof LLMConfigError) return { ok: false, error: error.message, configurationError: true }
    throw error
  }
  if (!resolved) return { ok: false, error: "No chat LLM provider is configured", configurationError: true }

  const { info, row } = resolved
  if (input.tools.length > 0 && !info.capabilities.tools) {
    return {
      ok: false,
      error: `${info.displayName} cannot call tools. Choose a model with tool support for the assistant.`,
      configurationError: true,
    }
  }

  try {
    const result = await generateText({
      model: resolved.model,
      instructions: input.system,
      messages: input.messages,
      tools: toToolSet(input.tools),
      maxOutputTokens: capTokens(row.maxTokens, input.maxOutputTokens),
      ...(info.capabilities.samplingParams && row.temperature !== null && { temperature: row.temperature }),
      providerOptions: providerOptionsFor(resolved, rowEffort(row), undefined),
      abortSignal: input.signal,
      maxRetries: 2,
    })

    const modelId = result.response.modelId || info.id
    const usage: TokenUsage = {
      inputTokens: result.usage.inputTokens ?? 0,
      cachedInputTokens: result.usage.inputTokenDetails?.cacheReadTokens ?? 0,
      cacheWriteTokens: result.usage.inputTokenDetails?.cacheWriteTokens ?? 0,
      outputTokens: result.usage.outputTokens ?? 0,
      reasoningTokens: result.usage.outputTokenDetails?.reasoningTokens ?? 0,
    }
    const served = lookupModel(info.provider, modelId)
    const toolCalls: ChatToolCall[] = result.toolCalls.map((call) => ({
      id: call.toolCallId,
      type: "function",
      function: { name: call.toolName, arguments: JSON.stringify(call.input ?? {}) },
    }))

    await recordUsage({
      attribution: input.attribution,
      provider: info.provider,
      modelId,
      usage,
      cost: costUsd(served.known ? served : info, usage),
      outcome: result.finishReason === "length" ? "length" : result.finishReason === "content-filter" ? "content-filter" : "ok",
      prompt: JSON.stringify(input.messages),
      response: result.text || JSON.stringify(toolCalls),
    })

    if (!result.text && toolCalls.length === 0) {
      return { ok: false, error: "The model returned no answer" }
    }
    return { ok: true, content: result.text, toolCalls, responseMessages: result.response.messages, usage, modelId }
  } catch (error) {
    if (input.signal?.aborted) return { ok: false, error: "Request timeout" }
    const cause = RetryError.isInstance(error) ? error.lastError : error
    const status = APICallError.isInstance(cause) ? cause.statusCode : undefined
    logger.error("Chat LLM call failed", error, { provider: info.provider, model: info.id, status })
    // The upstream body is never echoed
    return { ok: false, error: status ? `The LLM provider returned HTTP ${status}` : "The LLM provider returned an error" }
  }
}
