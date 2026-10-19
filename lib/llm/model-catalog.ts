/**
 * The models this app knows: prices and capabilities, one entry per model.
 *
 * Pure data, so client components can import it. `lib/llm/models.ts` looks
 * entries up and prices usage; nothing else should read the table directly.
 *
 * Sources (all as of 2026-10-17): the OpenAI rows carry over P0.13's table;
 * the Claude rows come from the live Anthropic pricing page; the Gemini row
 * and its 2026-12-01 price rise are third-party reports
 * (`research/llm-and-generative-models-2026.md` sections 3.1 to 3.3). Effort
 * levels are what each API accepts; OpenAI's per-model lists are partly from
 * search snippets, so an unlisted level is never sent (see `resolveEffort`).
 *
 * @module lib/llm/model-catalog
 */

export type LLMProviderId = "openai" | "anthropic" | "google" | "openai-compatible"

export type EffortLevel = "none" | "minimal" | "low" | "medium" | "high" | "xhigh" | "max"

/** Prices in USD per 1M tokens. `from` (inclusive, UTC date) marks a dated price change. */
export interface ModelPrice {
  input: number
  output: number
  cacheRead: number | null
  cacheWrite: number | null
  batch: { input: number; output: number } | null
  asOf: string
  from?: string
}

interface ModelCapabilities {
  structuredOutputs: boolean
  /** Whether `temperature` and `topP` are accepted. */
  samplingParams: boolean
  /** Accepted effort levels, lowest first; null when the model has no effort control. */
  effortLevels: readonly EffortLevel[] | null
  tools: boolean
  batch: boolean
  /** Whether the provider can re-run a refused request on another model server-side. */
  refusalFallback: boolean
  /** Shortest prompt prefix the provider caches, when known. */
  minCacheTokens: number | null
}

export interface ModelInfo {
  provider: LLMProviderId
  id: string
  displayName: string
  /** Undated first, then dated changes in date order; null when the price is unknown. */
  pricing: readonly ModelPrice[] | null
  capabilities: ModelCapabilities
  retiresOn: string | null
  known: boolean
}

const AS_OF = "2026-10-17"

function price(input: number, output: number, cacheRead: number | null, cacheWrite: number | null = null): ModelPrice {
  return { input, output, cacheRead, cacheWrite, batch: { input: input / 2, output: output / 2 }, asOf: AS_OF }
}

const GPT6_EFFORT = ["none", "low", "medium", "high"] as const
const GPT5X_EFFORT = ["none", "low", "medium", "high", "xhigh"] as const
const GPT5_EFFORT = ["minimal", "low", "medium", "high"] as const
const O_EFFORT = ["low", "medium", "high"] as const
const CLAUDE_EFFORT = ["low", "medium", "high", "xhigh", "max"] as const

function openai(
  id: string,
  displayName: string,
  pricing: ModelPrice,
  effortLevels: readonly EffortLevel[] | null,
  extra: { retiresOn?: string; structuredOutputs?: boolean } = {}
): ModelInfo {
  return {
    provider: "openai",
    id,
    displayName,
    pricing: [pricing],
    capabilities: {
      structuredOutputs: extra.structuredOutputs ?? true,
      samplingParams: effortLevels === null,
      effortLevels,
      tools: true,
      batch: true,
      refusalFallback: false,
      minCacheTokens: 1024,
    },
    retiresOn: extra.retiresOn ?? null,
    known: true,
  }
}

function claude(id: string, displayName: string, pricing: ModelPrice, refusalFallback: boolean): ModelInfo {
  return {
    provider: "anthropic",
    id,
    displayName,
    pricing: [pricing],
    capabilities: {
      structuredOutputs: true,
      // Claude 5.x returns a 400 for non-default temperature, top_p or top_k
      samplingParams: false,
      effortLevels: CLAUDE_EFFORT,
      tools: true,
      batch: true,
      refusalFallback,
      minCacheTokens: 512,
    },
    retiresOn: null,
    known: true,
  }
}

const OCTOBER_23 = "2026-10-23"

export const MODEL_CATALOG: readonly ModelInfo[] = [
  openai("gpt-6-astra", "GPT-6 Astra", price(10, 50, 1, 12.5), ["low", "medium", "high"]),
  openai("gpt-6.1-sol", "GPT-6.1 Sol", price(2, 10, 0.1), ["low", "medium", "high"]),
  openai("gpt-6-sol", "GPT-6 Sol", price(2, 10, 0.2), GPT6_EFFORT),
  openai("gpt-6-luna", "GPT-6 Luna", price(0.1, 0.5, 0.01), GPT6_EFFORT),
  openai("gpt-5.5", "GPT-5.5", price(5, 30, 0.5), GPT5X_EFFORT),
  openai("gpt-5.5-pro", "GPT-5.5 Pro", price(30, 180, null), ["high"]),
  openai("gpt-5.4", "GPT-5.4", price(2.5, 15, 0.25), GPT5X_EFFORT),
  openai("gpt-5.4-mini", "GPT-5.4 mini", price(0.75, 4.5, 0.075), GPT5X_EFFORT),
  openai("gpt-5.4-nano", "GPT-5.4 nano", price(0.2, 1.25, 0.02), GPT5X_EFFORT),
  openai("gpt-5.4-pro", "GPT-5.4 Pro", price(30, 180, null), ["high"]),
  openai("gpt-5", "GPT-5", price(1.25, 10, 0.125), GPT5_EFFORT),
  openai("gpt-5-mini", "GPT-5 mini", price(0.25, 2, 0.025), GPT5_EFFORT),
  openai("gpt-5-nano", "GPT-5 nano", price(0.05, 0.4, 0.005), GPT5_EFFORT),
  openai("gpt-4.1", "GPT-4.1", price(2, 8, 0.5), null),
  openai("gpt-4.1-mini", "GPT-4.1 mini", price(0.4, 1.6, 0.1), null),
  openai("gpt-4.1-nano", "GPT-4.1 nano", price(0.1, 0.4, 0.025), null, { retiresOn: OCTOBER_23 }),
  openai("gpt-4o", "GPT-4o", price(2.5, 10, 1.25), null),
  openai("gpt-4o-mini", "GPT-4o mini", price(0.15, 0.6, 0.075), null),
  openai("o3", "o3", price(2, 8, 0.5), O_EFFORT),
  openai("o4-mini", "o4-mini", price(1.1, 4.4, 0.275), O_EFFORT, { retiresOn: OCTOBER_23 }),
  openai("o1", "o1", price(15, 60, 7.5), O_EFFORT, { retiresOn: OCTOBER_23 }),
  openai("gpt-4", "GPT-4", price(30, 60, null), null, { retiresOn: OCTOBER_23, structuredOutputs: false }),

  // Cache writes are the 5-minute rate. Haiku 5.5 doubles above 100K input
  // tokens; Rewind prompts stay far below that, so only the base rate is kept.
  claude("claude-fable-5-1", "Claude Fable 5.1", price(10, 50, 0.25, 12.5), true),
  claude("claude-opus-5-5", "Claude Opus 5.5", price(4, 20, 0.2, 5), true),
  claude("claude-sonnet-5-5", "Claude Sonnet 5.5", price(2, 10, 0.1, 2.5), true),
  claude("claude-haiku-5-5", "Claude Haiku 5.5", price(0.1, 0.5, 0.01, 0.125), false),

  {
    provider: "google",
    id: "gemini-4-argon",
    displayName: "Gemini 4 Argon",
    pricing: [price(2, 10, 0.1), { ...price(4, 20, 0.2), from: "2026-12-01" }],
    capabilities: {
      structuredOutputs: true,
      samplingParams: true,
      effortLevels: ["low", "medium", "high"],
      tools: true,
      batch: true,
      refusalFallback: false,
      minCacheTokens: null,
    },
    retiresOn: null,
    known: true,
  },
]
