"use server"

import { authOptions } from "@/lib/auth"
import { generateStructured } from "@/lib/llm/generate-structured"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { memberName } from "@/lib/wrapped/member-name"
import { wrappedLLMOutputSchema } from "@/lib/wrapped/llm-output-schema"
import { generateSystemPrompt, generateWrappedPrompt } from "@/lib/wrapped/prompt-template"
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
    // Admin-only: loads the configured LLM provider's API key and issues a
    // billable request, so it must not be callable by non-admin users.
    if (!session.user.isAdmin) {
      return {
        success: false,
        error: "Only admins can test prompt templates",
      }
    }

    const userId = session.user.id

    // Render the prompt the way member generation does, so an email-like
    // Plex username never reaches the model
    const renderedPrompt = await generateWrappedPrompt(
      memberName({ name: input.userName }) ?? "there",
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

      // Usage is recorded with no wrappedId: a playground test is not a generation
      const llmResult = await generateStructured({
        purpose: "wrapped",
        schema: wrappedLLMOutputSchema,
        system: generateSystemPrompt(),
        prompt: renderedPrompt,
        effort: "low",
        cacheKey: "rewind-v2",
        modelOverride: input.model,
        temperature: input.temperature,
        maxOutputTokens: input.maxTokens,
        attribution: { userId },
        recordText: true,
      })

      if (!llmResult.ok) {
        logger.warn("Prompt test failed", { code: llmResult.error.code })
        return { success: false, renderedPrompt, error: llmResult.error.message }
      }

      const { output, usage, cost, rawText } = llmResult.value
      return {
        success: true,
        renderedPrompt,
        llmResponse: rawText || JSON.stringify(output, null, 2),
        tokenUsage: {
          promptTokens: usage.inputTokens,
          completionTokens: usage.outputTokens,
          totalTokens: usage.inputTokens + usage.outputTokens,
          cost,
        },
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

