"use server"

import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { callOpenAI, LLMConfig } from "@/lib/wrapped/api-calls"
import { generateWrappedPrompt } from "@/lib/wrapped/prompt-template"
import { WrappedStatistics } from "@/types/wrapped"
import { getServerSession } from "next-auth"

const logger = createLogger("PROMPT_TEST")

interface TestPromptInput {
  userName: string
  year: number
  statistics: WrappedStatistics
  sendToAI: boolean
  templateString?: string // Optional template string to test (if not provided, uses active template)
  model?: string // Optional model to use (if not provided, uses configured model)
  temperature?: number // Optional temperature override (if not provided, uses configured temperature)
  maxTokens?: number // Optional maxTokens override (if not provided, uses configured maxTokens)
}

/**
 * Test a prompt template with sample data
 */
export async function testPromptTemplate(input: TestPromptInput) {
  try {
    // Get current session to record LLM usage for the admin user
    const session = await getServerSession(authOptions)
    if (!session || !session.user?.id) {
      return {
        success: false,
        error: "Authentication required",
      }
    }

    const userId = session.user.id

    // Render the prompt with the provided data
    const renderedPrompt = await generateWrappedPrompt(
      input.userName,
      input.year,
      input.statistics,
      input.templateString
    )

    // If sendToAI is true, use the configured LLM provider from database
    if (input.sendToAI) {
      // Check if LLM is disabled in config
      const appConfig = await prisma.config.findUnique({
        where: { id: "config" },
        select: { llmDisabled: true },
      })

      if (appConfig?.llmDisabled) {
        return {
          success: false,
          renderedPrompt,
          error: "LLM calls are currently disabled. Please enable LLM in admin settings to test prompts with AI.",
        }
      }

      // Get active LLM provider for wrapped generation
      const llmProvider = await prisma.lLMProvider.findFirst({
        where: { isActive: true, purpose: "wrapped" },
      })

      if (!llmProvider) {
        return {
          success: false,
          renderedPrompt,
          error: "No active LLM provider configured for wrapped generation. Please configure an LLM provider in settings.",
        }
      }

      if (!llmProvider.model && !input.model) {
        return {
          success: false,
          renderedPrompt,
          error: "No model configured. Please configure a model in admin settings or provide one in the test.",
        }
      }

      const config: LLMConfig = {
        provider: llmProvider.provider as "openai",
        apiKey: llmProvider.apiKey,
        model: input.model ?? llmProvider.model!,
        temperature: input.temperature ?? llmProvider.temperature ?? undefined,
        maxTokens: input.maxTokens ?? llmProvider.maxTokens ?? undefined,
      }

      // Currently only OpenAI is supported
      const llmResult = await callOpenAI(
        config,
        renderedPrompt,
        input.statistics,
        input.year,
        userId,
        input.userName
      )

      if (llmResult.success && llmResult.data) {
        // Record LLM usage for cost analysis
        // wrappedId is null since this is a playground test, not an actual wrapped generation
        if (llmResult.tokenUsage) {
          try {
            await prisma.lLMUsage.create({
              data: {
                wrappedId: null, // Playground tests don't have a wrapped ID
                userId,
                provider: config.provider,
                model: config.model || "gpt-4",
                prompt: renderedPrompt,
                response: llmResult.rawResponse || JSON.stringify(llmResult.data, null, 2),
                promptTokens: llmResult.tokenUsage.promptTokens,
                completionTokens: llmResult.tokenUsage.completionTokens,
                totalTokens: llmResult.tokenUsage.totalTokens,
                cost: llmResult.tokenUsage.cost,
              },
            })
          } catch (dbError) {
            logger.error("Failed to save LLM usage to database", dbError)
            // Don't fail the whole operation if logging fails
          }
        }

        return {
          success: true,
          renderedPrompt,
          llmResponse: llmResult.rawResponse || JSON.stringify(llmResult.data, null, 2),
          tokenUsage: llmResult.tokenUsage,
        }
      } else {
        return {
          success: false,
          renderedPrompt,
          error: llmResult.error || "Failed to get LLM response",
        }
      }
    }

    return {
      success: true,
      renderedPrompt,
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : "Failed to test prompt",
    }
  }
}

