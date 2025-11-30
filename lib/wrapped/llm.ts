/**
 * LLM integration for generating wrapped content
 */

import { prisma } from "@/lib/prisma"
import { getActiveLLMProvider } from "@/lib/services/service-helpers"
import { createLogger } from "@/lib/utils/logger"
import { callOpenAI, LLMConfig } from "@/lib/wrapped/api-calls"
import { generateMockWrappedData } from "@/lib/wrapped/mock-data"
import { generateWrappedPrompt } from "@/lib/wrapped/prompt-template"
import { WrappedData, WrappedStatistics } from "@/types/wrapped"

const logger = createLogger("LLM")

/**
 * Call LLM to generate wrapped content
 */
export async function generateWrappedWithLLM(
  userName: string,
  year: number,
  userId: string,
  wrappedId: string,
  statistics: WrappedStatistics
): Promise<{
  success: boolean
  data?: WrappedData
  error?: string
  tokenUsage?: {
    promptTokens: number
    completionTokens: number
    totalTokens: number
    cost: number
  }
}> {
  try {
    // Check if LLM is disabled in config
    const appConfig = await prisma.config.findUnique({
      where: { id: "config" },
    })

    if (appConfig?.llmDisabled) {
      logger.info("LLM calls are disabled - returning mock data")
      const mockData = generateMockWrappedData(userName, year, userId, statistics)

      // Still save a record that this was generated with mock data (no cost)
      // Always create a new record to track all usage, including regenerations
      try {
        await prisma.lLMUsage.create({
          data: {
            wrappedId,
            userId,
            provider: "mock",
            model: "mock",
            prompt: "[LLM Disabled - Mock Data]",
            response: JSON.stringify(mockData),
            promptTokens: 0,
            completionTokens: 0,
            totalTokens: 0,
            cost: 0,
          },
        })
      } catch (dbError) {
        logger.error("Failed to save mock usage to database", dbError)
        // Don't fail the whole operation if logging fails
      }

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

    // Get active LLM provider for wrapped generation
    const llmProviderService = await getActiveLLMProvider("wrapped")

    if (!llmProviderService) {
      return { success: false, error: "No active LLM provider configured for wrapped generation" }
    }

    const llmConfig = llmProviderService.config
    if (!llmConfig.model) {
      return { success: false, error: "No model configured for wrapped generation. Please configure a model in admin settings." }
    }

    const config: LLMConfig = {
      provider: llmConfig.provider as "openai",
      apiKey: llmConfig.apiKey,
      model: llmConfig.model,
      temperature: llmConfig.temperature ?? undefined,
      maxTokens: llmConfig.maxTokens ?? undefined,
    }

    // Generate prompt using template system
    const prompt = await generateWrappedPrompt(userName, year, statistics)

    // Call appropriate LLM provider
    // Currently only OpenAI is supported, but the structure allows for easy extension
    let llmResult
    if (config.provider === "openai") {
      llmResult = await callOpenAI(config, prompt, statistics, year, userId, userName)
    } else {
      return { success: false, error: "Unsupported LLM provider" }
    }

    if (!llmResult.success || !llmResult.data) {
      return llmResult
    }

    // Save token usage to database for cost tracking
    // Always create a new record to track all usage, including regenerations
    if (llmResult.tokenUsage) {
      try {
        await prisma.lLMUsage.create({
          data: {
            wrappedId,
            userId,
            provider: config.provider,
            model: config.model || "gpt-4",
            prompt,
            response: llmResult.rawResponse || JSON.stringify(llmResult.data),
            promptTokens: llmResult.tokenUsage.promptTokens,
            completionTokens: llmResult.tokenUsage.completionTokens,
            totalTokens: llmResult.tokenUsage.totalTokens,
            cost: llmResult.tokenUsage.cost,
          },
        })
      } catch (dbError) {
        logger.error("Failed to save token usage to database", dbError)
        // Don't fail the whole operation if logging fails
      }
    }

    return llmResult
  } catch (error) {
    logger.error("Error generating wrapped content", error)
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to generate wrapped content",
    }
  }
}

