import { z } from "zod"

import { createBaseUrlSchema } from "@/lib/validations/shared-schemas"

/** Every effort level a catalogue model accepts; the form offers only the chosen model's own. */
export const EFFORT_LEVELS = ["none", "minimal", "low", "medium", "high", "xhigh", "max"] as const

const apiKeySchema = z.string().trim().max(500, "API key is too long")

const commonFields = {
  model: z.string().trim().min(1, "Model is required").max(200, "Model id is too long"),
  effort: z.enum(EFFORT_LEVELS).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
}

function keyedProvider<P extends "openai" | "anthropic" | "google">(provider: P) {
  return z.object({ provider: z.literal(provider), apiKey: apiKeySchema.min(1, "API key is required"), ...commonFields })
}

/**
 * A provider row as an admin saves it. The base URL is admin-only (SEC-44):
 * only admin actions parse this schema; setup uses
 * {@link setupLLMProviderSchema}.
 */
export const llmProviderSchema = z.discriminatedUnion("provider", [
  keyedProvider("openai"),
  keyedProvider("anthropic"),
  keyedProvider("google"),
  z.object({
    provider: z.literal("openai-compatible"),
    baseUrl: createBaseUrlSchema(),
    // A local server such as Ollama has no key
    apiKey: apiKeySchema.optional(),
    ...commonFields,
  }),
])

/** The setup wizard stays OpenAI-only, with no base URL, until P11.32 and P10.25. */
export const setupLLMProviderSchema = z.object({
  provider: z.literal("openai", { message: "Please select a provider" }),
  apiKey: apiKeySchema.min(1, "API key is required"),
  model: z.string().trim().max(200).optional(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().min(1).max(100000).optional(),
})

export type SetupLLMProviderInput = z.infer<typeof setupLLMProviderSchema>
