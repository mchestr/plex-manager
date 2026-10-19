import { buildOpenAIParams, openAIModelCaps } from "@/lib/llm/openai-params"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CHAT_LLM")

// Default timeout: 30 seconds
const REQUEST_TIMEOUT_MS = 30000

export interface LLMConfig {
  provider: "openai"
  apiKey: string
  model: string // Required - no default model allowed
  temperature?: number
  maxTokens?: number
}

export interface ChatToolCall {
  id: string
  type: "function"
  function: {
    name: string
    arguments: string
  }
}

export interface ChatTool {
  type: "function"
  function: {
    name: string
    description: string
    parameters: Record<string, unknown>
  }
}

export interface ChatMessage {
  role: "user" | "assistant" | "system" | "tool"
  content: string | null
  tool_call_id?: string
  tool_calls?: ChatToolCall[]
  name?: string
}

export interface ChatCompletionUsage {
  prompt_tokens: number
  completion_tokens: number
  total_tokens: number
  prompt_tokens_details?: {
    cached_tokens?: number
  }
}

export interface ChatCompletionResponse {
  success: boolean
  content?: string | null
  toolCalls?: ChatToolCall[]
  error?: string
  /** The error is the admin's model choice, so its message is safe to show as is. */
  configurationError?: boolean
  usage?: ChatCompletionUsage
  model?: string
}

/** @internal */
export const RESPONSES_API_TOOLS_ERROR =
  "This model needs the Responses API for tools; choose gpt-6-sol, gpt-6-luna or a GPT-5 model for the assistant."

/**
 * Call OpenAI API for chat completions
 */
export async function callChatLLM(
  config: LLMConfig,
  messages: ChatMessage[],
  tools?: ChatTool[]
): Promise<ChatCompletionResponse> {
  if (!config.model) {
    return {
      success: false,
      error: "Model is required. Please configure a model in admin settings.",
    }
  }

  const model = config.model
  const hasTools = !!tools && tools.length > 0

  // Chat Completions cannot carry tools for these models, so the API call would only fail
  if (hasTools && openAIModelCaps(model).chatTools === "responses-only") {
    logger.warn("Chat model needs the Responses API for tools", { model })
    return { success: false, error: RESPONSES_API_TOOLS_ERROR, configurationError: true }
  }

  const requestBody: Record<string, unknown> = {
    model,
    messages,
    ...(hasTools && { tools }),
    // The token-limit name, temperature support and tool settings depend on the model
    ...buildOpenAIParams(model, {
      temperature: config.temperature,
      maxTokens: config.maxTokens,
      hasTools,
    }),
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => {
      controller.abort()
    }, REQUEST_TIMEOUT_MS)

    logger.debug("Starting OpenAI Chat API call", { model, toolCount: tools?.length })

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
    const message = choice?.message
    const content = message?.content
    const toolCalls = message?.tool_calls
    const usage = responseData.usage

    if (!content && (!toolCalls || toolCalls.length === 0)) {
      return { success: false, error: "No content or tool calls in LLM response" }
    }

    return {
      success: true,
      content,
      toolCalls,
      usage: usage ? {
        prompt_tokens: usage.prompt_tokens,
        completion_tokens: usage.completion_tokens,
        total_tokens: usage.total_tokens,
        prompt_tokens_details: usage.prompt_tokens_details,
      } : undefined,
      model: responseData.model || model
    }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return { success: false, error: "Request timeout" }
      }
      logger.error("OpenAI API error", error)
      return { success: false, error: `OpenAI API error: ${error.message}` }
    }
    return { success: false, error: "Unexpected error calling OpenAI API" }
  }
}
