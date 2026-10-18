/**
 * LLM pricing configuration and cost calculation utilities
 * Supports OpenAI and designed to be extensible for other providers
 */

import { normalizeOpenAIModelId } from "@/lib/llm/openai-params"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("LLM_PRICING")

/**
 * Model pricing per 1M tokens (input, output)
 * Based on OpenAI pricing: https://platform.openai.com/docs/pricing
 * Prices are for Standard tier (most common). Prices are stored as per 1M tokens.
 * Format: { input: price per 1M tokens, output: price per 1M tokens, cachedInput?: price per 1M tokens }
 */
export const MODEL_PRICING: Record<string, { input: number; output: number; cachedInput?: number }> = {
  // GPT-6 models (Standard tier, as of 2026-10-17)
  "gpt-6-astra": { input: 10.0, output: 50.0, cachedInput: 1.0 },
  "gpt-6.1-sol": { input: 2.0, output: 10.0, cachedInput: 0.1 },
  "gpt-6-sol": { input: 2.0, output: 10.0, cachedInput: 0.2 },
  "gpt-6-luna": { input: 0.1, output: 0.5, cachedInput: 0.01 },

  // GPT-5.5 / GPT-5.4 models (Standard tier, current catalog as of July 2026)
  "gpt-5.5": { input: 5.0, output: 30.0, cachedInput: 0.5 },
  "gpt-5.5-pro": { input: 30.0, output: 180.0 },
  "gpt-5.4": { input: 2.5, output: 15.0, cachedInput: 0.25 },
  "gpt-5.4-mini": { input: 0.75, output: 4.5, cachedInput: 0.075 },
  "gpt-5.4-nano": { input: 0.2, output: 1.25, cachedInput: 0.02 },
  "gpt-5.4-pro": { input: 30.0, output: 180.0 },
  "gpt-5.3-codex": { input: 1.75, output: 14.0, cachedInput: 0.175 },

  // GPT-5 models (legacy pricing kept for historical LLMUsage cost math)
  "gpt-5": { input: 1.25, output: 10.0, cachedInput: 0.125 },
  "gpt-5-mini": { input: 0.25, output: 2.0, cachedInput: 0.025 },
  "gpt-5-nano": { input: 0.05, output: 0.4, cachedInput: 0.005 },
  "gpt-5-pro": { input: 15.0, output: 120.0 },

  // GPT-4.1 models (Standard tier)
  "gpt-4.1": { input: 2.0, output: 8.0, cachedInput: 0.5 },
  "gpt-4.1-mini": { input: 0.4, output: 1.6, cachedInput: 0.1 },
  "gpt-4.1-nano": { input: 0.1, output: 0.4, cachedInput: 0.025 },

  // GPT-4o models (Standard tier)
  "gpt-4o": { input: 2.5, output: 10.0, cachedInput: 1.25 },
  "gpt-4o-mini": { input: 0.15, output: 0.6, cachedInput: 0.075 },

  // O-series models (Standard tier)
  "o1": { input: 15.0, output: 60.0, cachedInput: 7.5 },
  "o1-pro": { input: 150.0, output: 600.0 },
  "o3-pro": { input: 20.0, output: 80.0 },
  "o3": { input: 2.0, output: 8.0, cachedInput: 0.5 },
  "o3-deep-research": { input: 10.0, output: 40.0, cachedInput: 2.5 },
  "o4-mini": { input: 1.1, output: 4.4, cachedInput: 0.275 },
  "o4-mini-deep-research": { input: 2.0, output: 8.0, cachedInput: 0.5 },
  "o3-mini": { input: 1.1, output: 4.4, cachedInput: 0.55 },
  "o1-mini": { input: 1.1, output: 4.4, cachedInput: 0.55 },

  // Legacy GPT-4 models (Standard tier)
  "gpt-4-turbo": { input: 10.0, output: 30.0 },
  "gpt-4": { input: 30.0, output: 60.0 },
  "gpt-4-32k": { input: 60.0, output: 120.0 },

  // GPT-4 batch tier models
  "gpt-4-0613-batch": { input: 15.0, output: 30.0 },

  // GPT-4o priority tier models
  "gpt-4o-priority": { input: 4.25, output: 17.0 },

  // GPT-3.5 Turbo models (Standard tier)
  "gpt-3.5-turbo": { input: 0.5, output: 1.5 },
  "gpt-3.5-turbo-instruct": { input: 1.5, output: 2.0 },
  "gpt-3.5-turbo-16k": { input: 3.0, output: 4.0 },
}

/**
 * Estimate token count from text
 * Uses a rough approximation: ~4 characters per token (common for English text)
 * This is an approximation and actual token counts may vary
 */
export function estimateTokens(text: string): number {
  // Rough approximation: ~4 characters per token for English text
  // Add some overhead for system messages and formatting
  return Math.ceil(text.length / 4)
}

/**
 * Calculate cost based on model and token counts.
 * Prices in MODEL_PRICING are per 1M tokens. `cachedTokens` is the part of
 * `promptTokens` served from the prompt cache (OpenAI's
 * `usage.prompt_tokens_details.cached_tokens`) and is priced at `cachedInput`.
 * An unknown or missing model costs 0 and logs a warning, so cost views never
 * show a guessed price.
 */
export function calculateCost(
  model: string | null | undefined,
  promptTokens: number,
  completionTokens: number,
  cachedTokens = 0
): number {
  // Exact match first (e.g. "gpt-4-0613-batch"), then the normalized ID
  // without an "openai/" prefix or a date snapshot suffix
  const pricing = model
    ? MODEL_PRICING[model] ?? MODEL_PRICING[normalizeOpenAIModelId(model)]
    : undefined

  if (!pricing) {
    logger.warn("Unknown model price", { model })
    return 0
  }

  const cachedPrice = pricing.cachedInput ?? pricing.input
  return (
    ((promptTokens - cachedTokens) / 1000000) * pricing.input +
    (cachedTokens / 1000000) * cachedPrice +
    (completionTokens / 1000000) * pricing.output
  )
}

/**
 * Estimate cost for a prompt before sending to LLM
 * @param prompt The rendered prompt text
 * @param model The model to use for pricing
 * @param estimatedCompletionTokens Estimated completion tokens (defaults to maxTokens or 6000)
 * @param systemPrompt Optional system prompt to include in token count
 */
export function estimateCost(
  prompt: string,
  model: string | null | undefined,
  estimatedCompletionTokens?: number,
  systemPrompt?: string
): {
  promptTokens: number
  estimatedCompletionTokens: number
  totalTokens: number
  cost: number
} {
  // Estimate prompt tokens (include system prompt if provided)
  const promptText = systemPrompt ? `${systemPrompt}\n\n${prompt}` : prompt
  const promptTokens = estimateTokens(promptText)

  // Use provided estimate or default to 6000 (common max_tokens for wrapped generation)
  const completionTokens = estimatedCompletionTokens ?? 6000
  const totalTokens = promptTokens + completionTokens

  const cost = calculateCost(model, promptTokens, completionTokens)

  return {
    promptTokens,
    estimatedCompletionTokens: completionTokens,
    totalTokens,
    cost,
  }
}

