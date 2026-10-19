/**
 * Model facts in one place: lookup, effort mapping and cost.
 *
 * ## Overview
 *
 * Every price and capability check reads `MODEL_CATALOG` through
 * `lookupModel`. There are no prefix families: an ID is normalised, then
 * matched exactly, so a new model is unknown until it is added here.
 *
 * ## Special cases
 *
 * - IDs are lowercased, and an `openai/` prefix and a date suffix
 *   (`-2026-09-22` or `-20260922`) are stripped, so `openai/GPT-6-Sol-2026-09-22`
 *   is `gpt-6-sol`.
 * - An unknown model gets `pricing: null` and conservative capabilities: no
 *   sampling parameters, no effort control, and structured outputs only on
 *   first-party providers. It costs 0, with a warning, never a guessed price.
 * - `costUsd` uses the price in force on the call's date, so Gemini 4 Argon
 *   costs twice as much from 2026-12-01.
 *
 * Pure, so the playground's client component can import it.
 *
 * @module lib/llm/models
 */

import {
  MODEL_CATALOG,
  type EffortLevel,
  type LLMProviderId,
  type ModelInfo,
  type ModelPrice,
} from "@/lib/llm/model-catalog"
import { createLogger } from "@/lib/utils/logger"

export type { EffortLevel, LLMProviderId, ModelInfo } from "@/lib/llm/model-catalog"

const logger = createLogger("LLM_MODELS")

/** Token counts for one billed call. `outputTokens` includes reasoning tokens. */
export interface TokenUsage {
  inputTokens: number
  cachedInputTokens: number
  cacheWriteTokens?: number
  outputTokens: number
  reasoningTokens: number
}

/**
 * @example
 * ```ts
 * normalizeModelId("openai/GPT-6-Sol-2026-09-22") // "gpt-6-sol"
 * ```
 */
export function normalizeModelId(id: string): string {
  return id
    .trim()
    .toLowerCase()
    .replace(/^openai\//, "")
    .replace(/-(\d{4}-\d{2}-\d{2}|\d{8})$/, "")
}

const BY_KEY = new Map(MODEL_CATALOG.map((info) => [`${info.provider}:${info.id}`, info]))

/**
 * The catalogue entry for a model, or a conservative stand-in when it is unknown.
 *
 * @example
 * ```ts
 * lookupModel("openai", "openai/gpt-6-sol-2026-09-22").id // "gpt-6-sol"
 * lookupModel("openai-compatible", "qwen3.6:27b").pricing // null
 * ```
 */
export function lookupModel(provider: LLMProviderId, id: string): ModelInfo {
  const normalized = normalizeModelId(id)
  const known = BY_KEY.get(`${provider}:${normalized}`)
  if (known) return known
  return {
    provider,
    id: id.trim(),
    displayName: id.trim(),
    pricing: null,
    capabilities: {
      structuredOutputs: provider !== "openai-compatible",
      samplingParams: false,
      effortLevels: null,
      tools: true,
      batch: false,
      refusalFallback: false,
      minCacheTokens: null,
    },
    retiresOn: null,
    known: false,
  }
}

/** Every catalogue entry, optionally for one provider. */
export function listKnownModels(provider?: LLMProviderId): ModelInfo[] {
  return MODEL_CATALOG.filter((info) => !provider || info.provider === provider)
}

/** The price in force at `at`, or null when the model has none. */
export function priceAt(info: ModelInfo, at: Date = new Date()): ModelPrice | null {
  if (!info.pricing) return null
  const day = at.toISOString().slice(0, 10)
  let current: ModelPrice | null = null
  for (const entry of info.pricing) {
    if (!entry.from || entry.from <= day) current = entry
  }
  return current
}

const EFFORT_ORDER: readonly EffortLevel[] = ["none", "minimal", "low", "medium", "high", "xhigh", "max"]

/**
 * The requested effort if the model accepts it, else the nearest accepted level
 * above it (or its highest). Null when the model has no effort control.
 *
 * @example
 * ```ts
 * resolveEffort(lookupModel("openai", "gpt-6.1-sol"), "none") // "low"
 * resolveEffort(lookupModel("openai", "gpt-4o"), "low") // null
 * ```
 */
export function resolveEffort(info: ModelInfo, effort: EffortLevel): EffortLevel | null {
  const levels = info.capabilities.effortLevels
  if (!levels || levels.length === 0) return null
  if (levels.includes(effort)) return effort
  const wanted = EFFORT_ORDER.indexOf(effort)
  return levels.find((level) => EFFORT_ORDER.indexOf(level) > wanted) ?? levels[levels.length - 1]
}

/**
 * Cost in USD: uncached input, cached input (and cache writes where priced),
 * and output including reasoning. A model with no price costs 0 and logs one
 * warning (RWP-22).
 *
 * @example
 * ```ts
 * costUsd(lookupModel("openai", "gpt-6-sol"), {
 *   inputTokens: 2_000_000, cachedInputTokens: 1_000_000,
 *   outputTokens: 1_000_000, reasoningTokens: 400_000,
 * }) // 2 + 0.2 + 10 = 12.2
 * ```
 */
export function costUsd(info: ModelInfo, usage: TokenUsage, at: Date = new Date()): number {
  const rate = priceAt(info, at)
  if (!rate) {
    logger.warn("Unknown model price", { provider: info.provider, model: info.id })
    return 0
  }
  const cacheWrite = rate.cacheWrite === null ? 0 : (usage.cacheWriteTokens ?? 0)
  const uncached = Math.max(0, usage.inputTokens - usage.cachedInputTokens - cacheWrite)
  return (
    (uncached * rate.input +
      usage.cachedInputTokens * (rate.cacheRead ?? rate.input) +
      cacheWrite * (rate.cacheWrite ?? 0) +
      usage.outputTokens * rate.output) /
    1_000_000
  )
}

/** Rough count: about four characters per token for English text. */
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4)
}

/**
 * A pre-flight estimate for the playground, with no cache hits.
 *
 * @example
 * ```ts
 * estimateCostUsd({ provider: "openai", model: "gpt-6-luna", prompt: "x".repeat(4000), completionTokens: 2000 })
 * // { promptTokens: 1000, estimatedCompletionTokens: 2000, totalTokens: 3000, cost: 0.0011 }
 * ```
 */
export function estimateCostUsd(input: {
  provider: LLMProviderId
  model: string
  prompt: string
  systemPrompt?: string
  completionTokens?: number
}) {
  const promptText = input.systemPrompt ? `${input.systemPrompt}\n\n${input.prompt}` : input.prompt
  const promptTokens = estimateTokens(promptText)
  const completionTokens = input.completionTokens ?? 6000
  const cost = costUsd(lookupModel(input.provider, input.model), {
    inputTokens: promptTokens,
    cachedInputTokens: 0,
    outputTokens: completionTokens,
    reasoningTokens: 0,
  })
  return {
    promptTokens,
    estimatedCompletionTokens: completionTokens,
    totalTokens: promptTokens + completionTokens,
    cost,
  }
}
