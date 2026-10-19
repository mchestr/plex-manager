"use server"

import { z } from "zod"

import { adminAction } from "@/lib/actions/define-action"
import { fail, ok, type ActionResult } from "@/lib/actions/result"
import { generateStructured } from "@/lib/llm/generate-structured"
import { listKnownModels, normalizeModelId } from "@/lib/llm/models"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import { yearSchema } from "@/lib/validations/shared-schemas"
import { memberName } from "@/lib/wrapped/member-name"
import { wrappedLLMOutputSchema } from "@/lib/wrapped/llm-output-schema"
import { generateSystemPrompt, generateWrappedPrompt } from "@/lib/wrapped/prompt-template"
import type { WrappedStatistics } from "@/types/wrapped"

const logger = createLogger("PROMPT_TEST")

/** The rendered prompt, and with `sendToAI` the model's answer and its usage. */
interface PromptTestData {
  renderedPrompt: string
  llmResponse?: string
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number; cost: number }
}

const KNOWN_MODEL_IDS = new Set(listKnownModels().map((info) => info.id))

const testPromptSchema = z.object({
  userName: z.string().min(1).max(200),
  year: yearSchema,
  // The playground passes the statistics it loaded from the stored Rewind; the
  // template renderer reads them as WrappedStatistics.
  statistics: z.custom<WrappedStatistics>((value) => typeof value === "object" && value !== null),
  sendToAI: z.boolean(),
  // Optional template string to test (if not provided, uses active template)
  templateString: z.string().max(50_000).optional(),
  // Only catalogue models: a free-form id would bill an arbitrary model
  model: z
    .string()
    .max(200)
    .refine((id) => KNOWN_MODEL_IDS.has(normalizeModelId(id)), "Choose a model from the list")
    .optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(64_000).optional(),
})

/**
 * Test a prompt template with sample data (admin only).
 *
 * Renders the prompt; with `sendToAI`, also sends it to the configured
 * provider, billed to the admin. `data.renderedPrompt` is always set on success.
 */
export const testPromptTemplate = adminAction({
  input: testPromptSchema,
  fallbackError: "Failed to test prompt",
  handler: async (input, { userId }): Promise<ActionResult<PromptTestData>> => {
    // Render the prompt the way member generation does, so an email-like
    // Plex username never reaches the model
    const renderedPrompt = await generateWrappedPrompt(
      memberName({ name: input.userName }) ?? "there",
      input.year,
      input.statistics,
      input.templateString
    )

    if (!input.sendToAI) {
      return ok({ renderedPrompt })
    }

    const appConfig = await prisma.config.findUnique({
      where: { id: "config" },
      select: { llmDisabled: true },
    })

    if (appConfig?.llmDisabled) {
      return fail(
        "CONFLICT",
        "LLM calls are currently disabled. Please enable LLM in admin settings to test prompts with AI."
      )
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
      return fail("UPSTREAM_UNAVAILABLE", llmResult.error.message)
    }

    const { output, usage, cost, rawText } = llmResult.value
    return ok({
      renderedPrompt,
      llmResponse: rawText || JSON.stringify(output, null, 2),
      tokenUsage: {
        promptTokens: usage.inputTokens,
        completionTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
        cost,
      },
    })
  },
})
