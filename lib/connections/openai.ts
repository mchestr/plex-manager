import { isConnectionTestBypassed } from "@/lib/connections/connection-test"

const OPENAI_API_URL = "https://api.openai.com/v1/models"
const CONNECTION_TIMEOUT_MS = 10000 // 10 seconds

interface OpenAIErrorResponse {
  error?: {
    message?: string
  }
}

interface OpenAIModelResponse {
  data?: Array<{ id: string }>
  error?: {
    message?: string
  }
}

export async function testOpenAIConnection(apiKey: string): Promise<{ success: boolean; error?: string }> {
  // TEST MODE BYPASS - see isConnectionTestBypassed
  if (isConnectionTestBypassed()) {
    return { success: true }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS)

    const response = await fetch(OPENAI_API_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: "Invalid API key" }
      }
      return { success: false, error: `Connection failed: ${response.statusText}` }
    }

    const data = (await response.json()) as OpenAIErrorResponse

    // Check if OpenAI API returned an error
    if (data.error) {
      return { success: false, error: data.error.message || "OpenAI API error" }
    }

    return { success: true }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return { success: false, error: "Connection timeout - please check your internet connection" }
      }
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to connect to OpenAI API" }
  }
}

export async function fetchOpenAIModels(apiKey: string): Promise<{ success: boolean; models?: string[]; error?: string }> {
  // TEST MODE BYPASS - see isConnectionTestBypassed
  if (isConnectionTestBypassed()) {
    return {
      success: true,
      models: ['gpt-5.4-mini', 'gpt-6-sol', 'gpt-6-luna'],
    }
  }

  try {
    const controller = new AbortController()
    const timeoutId = setTimeout(() => controller.abort(), CONNECTION_TIMEOUT_MS)

    const response = await fetch(OPENAI_API_URL, {
      method: "GET",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: controller.signal,
    })

    clearTimeout(timeoutId)

    if (!response.ok) {
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: "Invalid API key" }
      }
      return { success: false, error: `Connection failed: ${response.statusText}` }
    }

    const data = (await response.json()) as OpenAIModelResponse

    // Check if OpenAI API returned an error
    if (data.error) {
      return { success: false, error: data.error.message || "OpenAI API error" }
    }

    // Extract model IDs and filter for chat models (gpt-*)
    const models = (data.data || [])
      .map((model) => model.id)
      .filter((id) => id.startsWith("gpt-"))
      .sort()

    return { success: true, models }
  } catch (error) {
    if (error instanceof Error) {
      if (error.name === "AbortError") {
        return { success: false, error: "Connection timeout - please check your internet connection" }
      }
      return { success: false, error: `Connection error: ${error.message}` }
    }
    return { success: false, error: "Failed to fetch OpenAI models" }
  }
}

