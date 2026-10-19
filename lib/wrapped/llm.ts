/**
 * LLM integration for generating wrapped content
 */

import { generateStructured, type StructuredErrorCode } from "@/lib/llm/generate-structured"
import { recordUsage } from "@/lib/llm/usage"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { assembleWrappedData } from "@/lib/wrapped/assemble-wrapped"
import { wrappedLLMOutputSchema } from "@/lib/wrapped/llm-output-schema"
import { generateMockWrappedData } from "@/lib/wrapped/mock-data"
import { generateSystemPrompt, generateWrappedPrompt } from "@/lib/wrapped/prompt-template"
import { WrappedData, WrappedStatistics } from "@/types/wrapped"

const logger = createLogger("LLM")

// The caller's signal wins; without one the call stops after 5 minutes
const REQUEST_TIMEOUT_MS = Number(process.env.LLM_REQUEST_TIMEOUT_MS) || 300_000

/**
 * Call LLM to generate wrapped content.
 *
 * `promptName` is the only name the model (or the mock copy) sees, so it must
 * never be an email; `displayName` is what the stored Rewind shows.
 */
export async function generateWrappedWithLLM(args: {
  promptName: string
  displayName: string
  year: number
  userId: string
  wrappedId: string
  statistics: WrappedStatistics
  signal?: AbortSignal
}): Promise<{
  success: boolean
  data?: WrappedData
  error?: string
  errorCode?: StructuredErrorCode
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost: number
  }
}> {
  const { promptName, displayName, year, userId, wrappedId, statistics, signal } = args

  try {
    // Check if LLM is disabled in config
    const appConfig = await prisma.config.findUnique({
      where: { id: "config" },
    })

    if (appConfig?.llmDisabled) {
      logger.info("LLM calls are disabled - returning mock data")
      const mockData = generateMockWrappedData({ promptName, displayName, year, userId, statistics })

      // Still record the run (no cost), including regenerations
      await recordUsage({
        attribution: { userId, wrappedId },
        provider: "mock",
        modelId: "mock",
        usage: { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 },
        cost: 0,
        outcome: "ok",
        prompt: "[LLM Disabled - Mock Data]",
        response: JSON.stringify(mockData),
      })

      return {
        success: true,
        data: mockData,
        tokenUsage: {
          promptTokens: 0,
          completionTokens: 0,
          totalTokens: 0,
          cost: 0,
        },
      }
    }

    // Generate prompt using template system
    const prompt = await generateWrappedPrompt(promptName, year, statistics)

    const llmResult = await generateStructured({
      purpose: "wrapped",
      schema: wrappedLLMOutputSchema,
      system: generateSystemPrompt(),
      prompt,
      effort: "low",
      cacheKey: "rewind-v2",
      signal: signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      attribution: { userId, wrappedId },
      recordText: true,
    })

    if (!llmResult.ok) {
      return { success: false, error: llmResult.error.message, errorCode: llmResult.error.code }
    }

    // Merge the LLM's creative output with code-computed statistics
    const wrappedData = assembleWrappedData({
      output: llmResult.value.output,
      statistics,
      userId,
      userName: displayName,
      year,
    })

    const { usage, cost } = llmResult.value
    return {
      success: true,
      data: wrappedData,
      tokenUsage: {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
        cost,
      },
    }
  } catch (error) {
    logger.error("Error generating wrapped content", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate wrapped content",
    }
  }
}

