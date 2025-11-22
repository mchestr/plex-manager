/**
 * LLM API call implementations
 * Currently supports OpenAI, but designed to be extensible for other providers
 */

import { createLogger } from "@/lib/utils/logger"
import { WrappedData, WrappedStatistics } from "@/types/wrapped"
import { calculateCost } from "./pricing"
import { parseWrappedResponse } from "./prompt"
import { generateSystemPrompt } from "./prompt-template"

const logger = createLogger("LLM")

const DEFAULT_MODEL = "gpt-4"
const DEFAULT_TEMPERATURE = 0.8
const DEFAULT_MAX_TOKENS = 6000
// Default timeout: 5 minutes (300 seconds)
// Can be overridden via LLM_REQUEST_TIMEOUT_MS environment variable
const REQUEST_TIMEOUT_MS = process.env.LLM_REQUEST_TIMEOUT_MS
  ? parseInt(process.env.LLM_REQUEST_TIMEOUT_MS, 10)
  : 300000 // 5 minutes default

export interface LLMConfig {
  provider: "openai"
  apiKey: string
  model?: string
  temperature?: number
  maxTokens?: number
}

export interface LLMResponse {
  success: boolean
  data?: WrappedData
  error?: string
  rawResponse?: string // Raw response content for database storage
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost: number
  }
}

/**
 * Determine if a model requires max_completion_tokens instead of max_tokens
 * Newer models like GPT-5, o1, o3 use max_completion_tokens
 */
function requiresMaxCompletionTokens(model: string): boolean {
  const modelLower = model.toLowerCase()
  // Newer models that use max_completion_tokens
  return (
    modelLower.startsWith("gpt-5") ||
    modelLower.startsWith("o1") ||
    modelLower.startsWith("o3")
  )
}

/**
 * Call OpenAI API to generate wrapped content
 */
export async function callOpenAI(
  config: LLMConfig,
  prompt: string,
  statistics: WrappedStatistics,
  year: number,
  userId: string,
  userName: string
): Promise<LLMResponse> {
  const model = config.model ?? DEFAULT_MODEL

  // Build request body with appropriate token limit parameter
  const requestBody: Record<string, unknown> = {
    model,
    messages: [
      {
        role: "system",
        content: generateSystemPrompt(),
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    temperature: config.temperature ?? DEFAULT_TEMPERATURE,
  }

  // Use max_completion_tokens for newer models, max_tokens for older models
  const maxTokensValue = config.maxTokens ?? DEFAULT_MAX_TOKENS
  if (requiresMaxCompletionTokens(model)) {
    requestBody.max_completion_tokens = maxTokensValue
  } else {
    requestBody.max_tokens = maxTokensValue
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      logger.warn("Request timeout", { timeoutMs: REQUEST_TIMEOUT_MS, timeoutSeconds: REQUEST_TIMEOUT_MS / 1000 })
      controller.abort()
    }, REQUEST_TIMEOUT_MS)

    logger.debug("Starting OpenAI API call", {
      timeoutMs: REQUEST_TIMEOUT_MS,
      timeoutSeconds: REQUEST_TIMEOUT_MS / 1000,
      model,
    })
    const requestStartTime = Date.now()

    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    })

    clearTimeout(timeoutId)
    const requestDuration = Date.now() - requestStartTime
    logger.debug("OpenAI API call completed", {
      duration: requestDuration,
      durationSeconds: (requestDuration / 1000).toFixed(2),
    })

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}))
      logger.error("OpenAI API error", undefined, {
        status: response.status,
        statusText: response.statusText,
        errorMessage: errorData.error?.message,
      })
      return {
        success: false,
        error: errorData.error?.message ?? `OpenAI API error: ${response.statusText}`,
      }
    }

    const responseData = await response.json()
    const choice = responseData.choices?.[0]
    const content = choice?.message?.content

    if (!content) {
      logger.error("No content in LLM response")
      return { success: false, error: "No content in LLM response" }
    }

    // Check if response was truncated
    const finishReason = choice?.finish_reason
    const trimmedContent = content.trim()

    // Check if JSON appears incomplete (doesn't end with closing brace or markdown block)
    const isIncompleteJson = !trimmedContent.endsWith("}") && !trimmedContent.endsWith("```")

    // If finish reason is "length", the response was definitely truncated
    // Also check if JSON structure appears incomplete
    if (finishReason === "length" || isIncompleteJson) {
      logger.error("Response appears to be truncated", undefined, {
        finishReason,
        contentLength: content.length,
        lastChars: trimmedContent.slice(-100),
        isIncompleteJson,
      })
      return {
        success: false,
        error: "LLM response was truncated. The generated content exceeded the token limit. Please try regenerating.",
      }
    }

    const wrappedData = parseWrappedResponse(content, statistics, year, userId, userName)

    // Calculate token usage
    const usage = responseData.usage ?? {}
    const promptTokens = usage.prompt_tokens ?? 0
    const completionTokens = usage.completion_tokens ?? 0
    const totalTokens = usage.total_tokens ?? 0

    // Calculate cost based on model-specific pricing
    const cost = calculateCost(model, promptTokens, completionTokens, "openai")

    return {
      success: true,
      data: wrappedData,
      rawResponse: content,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens,
        cost,
      },
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        logger.error("Request aborted due to timeout", undefined, { timeoutMs: REQUEST_TIMEOUT_MS })
        return {
          success: false,
          error: `Request timeout - the API call exceeded the ${REQUEST_TIMEOUT_MS / 1000}s timeout limit. LLM generation can take longer for complex prompts. Consider increasing LLM_REQUEST_TIMEOUT_MS environment variable if needed.`,
        }
      }
      logger.error("OpenAI API error", error)
      return {
        success: false,
        error: `OpenAI API error: ${error.message}`,
      }
    }
    logger.error("Unexpected error", error)
    return {
      success: false,
      error: "An unexpected error occurred while calling the OpenAI API",
    }
  }
}

