/**
 * Chat Completions request fields for the admin assistant (`lib/llm/chat.ts`).
 *
 * ## Overview
 *
 * A lookup into `lib/llm/models.ts`, with no model-name patterns: a model with
 * effort levels is a reasoning model and takes `max_completion_tokens`; a
 * model takes `temperature` only when its entry allows sampling parameters.
 * An unknown model is treated as a reasoning model, which every current
 * OpenAI model accepts. P2.12 moves the assistant onto the provider registry
 * and deletes this module.
 *
 * | Tool rule | Models |
 * |-----------|--------|
 * | Tools need the Responses API | `gpt-6-astra`, `gpt-6.1-sol` |
 * | Tools need `reasoning_effort: "none"` | `gpt-6-sol`, `gpt-6-luna` |
 *
 * The GPT-6 tool rules come from OpenAI's GPT-6 guide as seen in search
 * snippets (October 2026), not from a live request.
 *
 * @module lib/llm/openai-params
 */

import { lookupModel, normalizeModelId } from "@/lib/llm/models"

/** Default for new providers: current, off every retirement list, and handled by Chat Completions. */
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"

/**
 * How a model handles function tools in Chat Completions.
 * - `yes`: tools work as sent.
 * - `reasoning-none`: tools work only with `reasoning_effort: "none"`.
 * - `responses-only`: tools need the Responses API, which the assistant does not use yet.
 *
 * @internal
 */
export type ChatToolSupport = "yes" | "reasoning-none" | "responses-only"

export interface OpenAIModelCaps {
  tokenParam: "max_tokens" | "max_completion_tokens"
  acceptsTemperature: boolean
  chatTools: ChatToolSupport
}

export interface OpenAIRequestParams {
  max_tokens?: number
  max_completion_tokens?: number
  temperature?: number
  reasoning_effort?: "none"
}

const RESPONSES_ONLY_TOOLS = new Set(["gpt-6-astra", "gpt-6.1-sol"])
const REASONING_NONE_TOOLS = new Set(["gpt-6-sol", "gpt-6-luna"])

/**
 * Capabilities of an OpenAI model for Chat Completions.
 *
 * @example
 * ```ts
 * openAIModelCaps("gpt-6-luna")
 * // { tokenParam: "max_completion_tokens", acceptsTemperature: false, chatTools: "reasoning-none" }
 * ```
 */
export function openAIModelCaps(model: string): OpenAIModelCaps {
  const info = lookupModel("openai", model)
  const id = normalizeModelId(model)
  const nonReasoning = info.known && info.capabilities.effortLevels === null
  return {
    tokenParam: nonReasoning ? "max_tokens" : "max_completion_tokens",
    acceptsTemperature: info.capabilities.samplingParams,
    chatTools: RESPONSES_ONLY_TOOLS.has(id) ? "responses-only" : REASONING_NONE_TOOLS.has(id) ? "reasoning-none" : "yes",
  }
}

/**
 * The Chat Completions fields that depend on the model: the token limit under
 * the right name, the temperature where it is accepted, and
 * `reasoning_effort: "none"` when tools go to a model that needs it.
 * Unset options are left out. Callers check `chatTools === "responses-only"`
 * themselves, because no Chat Completions field makes tools work there.
 *
 * @example
 * ```ts
 * buildOpenAIParams("gpt-4o", { temperature: 0.8, maxTokens: 6000 })
 * // { max_tokens: 6000, temperature: 0.8 }
 * buildOpenAIParams("gpt-6-sol", { temperature: 0.8, maxTokens: 1000, hasTools: true })
 * // { max_completion_tokens: 1000, reasoning_effort: "none" }
 * ```
 */
export function buildOpenAIParams(
  model: string,
  options: { temperature?: number; maxTokens?: number; hasTools?: boolean }
): OpenAIRequestParams {
  const caps = openAIModelCaps(model)
  const params: OpenAIRequestParams = {}

  if (options.maxTokens !== undefined) {
    params[caps.tokenParam] = options.maxTokens
  }
  if (options.temperature !== undefined && caps.acceptsTemperature) {
    params.temperature = options.temperature
  }
  if (options.hasTools && caps.chatTools === "reasoning-none") {
    params.reasoning_effort = "none"
  }

  return params
}
