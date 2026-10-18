/**
 * LLM API call implementations
 * Currently supports OpenAI, but designed to be extensible for other providers
 */

import { buildOpenAIParams, openAIModelCaps } from "@/lib/llm/openai-params"
import { calculateCost } from "@/lib/llm/pricing"
import { fetchWithTimeout, isTimeoutError } from "@/lib/utils/fetch-with-timeout"
import { createLogger } from "@/lib/utils/logger"
import {
  WrappedLLMOutput,
  wrappedOutputJsonSchema,
} from "@/lib/wrapped/llm-output-schema"
import { parseWrappedLLMOutput } from "@/lib/wrapped/parse-llm-output"
import { generateSystemPrompt } from "@/lib/wrapped/prompt-template"

const logger = createLogger("LLM")

// Default timeout: 5 minutes (300 seconds)
// Can be overridden via LLM_REQUEST_TIMEOUT_MS environment variable
const REQUEST_TIMEOUT_MS = process.env.LLM_REQUEST_TIMEOUT_MS
  ? parseInt(process.env.LLM_REQUEST_TIMEOUT_MS, 10)
  : 300000 // 5 minutes default

export interface LLMConfig {
  provider: "openai"
  apiKey: string
  model: string // Required - no default model allowed
  temperature?: number
  maxTokens?: number
}

export interface LLMResponse {
  success: boolean
  output?: WrappedLLMOutput
  error?: string
  rawResponse?: string // Raw response content for database storage
  model?: string // The model the API reports serving, for LLMUsage
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost: number
  }
}

/**
 * Call OpenAI API to generate the wrapped creative content.
 *
 * The response is schema-enforced via structured outputs where the model
 * supports it, and always Zod-validated. Returns the validated creative
 * output only — merging with statistics happens in `assembleWrappedData`.
 */
export async function callOpenAI(
  config: LLMConfig,
  prompt: string
): Promise<LLMResponse> {
  if (!config.model) {
    return {
      success: false,
      error: "Model is required. Please configure a model in admin settings.",
    }
  }

  const model = config.model

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
    // The token-limit name and temperature support depend on the model
    ...buildOpenAIParams(model, {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
    }),
  }

  // Enforce the output schema at the API level where supported; fall back to
  // plain JSON mode otherwise. Zod validation happens regardless.
  if (openAIModelCaps(model).structuredOutputs) {
    requestBody.response_format = {
      type: "json_schema",
      json_schema: {
        name: "plex_wrapped",
        strict: true,
        schema: wrappedOutputJsonSchema(),
      },
    }
  } else {
    requestBody.response_format = { type: "json_object" }
  }

  try {
    logger.debug("Starting OpenAI API call", {
      timeoutMs: REQUEST_TIMEOUT_MS,
      timeoutSeconds: REQUEST_TIMEOUT_MS / 1000,
      model,
    })
    const requestStartTime = Date.now()

    const response = await fetchWithTimeout("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify(requestBody),
      timeoutMs: REQUEST_TIMEOUT_MS,
    })

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

    const parseResult = parseWrappedLLMOutput(content)
    if (!parseResult.success) {
      logger.error("LLM response failed validation", undefined, {
        error: parseResult.error,
        issues: parseResult.issues,
      })
      return {
        success: false,
        error: parseResult.error,
        rawResponse: content,
      }
    }

    // Calculate token usage
    const usage = responseData.usage ?? {}
    const promptTokens = usage.prompt_tokens ?? 0
    const completionTokens = usage.completion_tokens ?? 0
    const totalTokens = usage.total_tokens ?? 0
    const cachedTokens = usage.prompt_tokens_details?.cached_tokens ?? 0

    // Price and record the model the API reports serving (e.g. a dated snapshot)
    const servedModel: string = responseData.model ?? model
    const cost = calculateCost(servedModel, promptTokens, completionTokens, cachedTokens)

    return {
      success: true,
      output: parseResult.output,
      rawResponse: content,
      model: servedModel,
      tokenUsage: {
        promptTokens,
        completionTokens,
        totalTokens,
        cost,
      },
    }
  } catch (error) {
    if (isTimeoutError(error)) {
      logger.error("Request aborted due to timeout", undefined, { timeoutMs: REQUEST_TIMEOUT_MS })
      return {
        success: false,
        error: `Request timeout - the API call exceeded the ${REQUEST_TIMEOUT_MS / 1000}s timeout limit. LLM generation can take longer for complex prompts. Consider increasing LLM_REQUEST_TIMEOUT_MS environment variable if needed.`,
      }
    }
    if (error instanceof Error) {
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
