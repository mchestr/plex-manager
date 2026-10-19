/**
 * Shared OpenAI model capabilities and Chat Completions request parameters.
 *
 * ## Overview
 *
 * The Rewind client (`lib/wrapped/api-calls.ts`) and the assistant client
 * (`lib/llm/chat.ts`) both build their request fields here, so a model behaves
 * the same way in both. Capabilities are inferred from the model ID:
 *
 * | Rule              | Models                                          |
 * |-------------------|-------------------------------------------------|
 * | Reasoning model   | `gpt-5*`, `gpt-6*`, `o<digit>*`                 |
 * | Structured output | `gpt-4o*`, `gpt-4.1*`, `gpt-5*`, `gpt-6*`, `o3*`, `o4*` |
 * | Tools need the Responses API | `gpt-6-astra`, `gpt-6.1-sol`         |
 * | Tools need `reasoning_effort: "none"` | `gpt-6-sol`, `gpt-6-luna`   |
 *
 * Reasoning models take `max_completion_tokens` and no `temperature`; every
 * other model takes `max_tokens` and keeps the configured temperature.
 *
 * ## Special cases
 *
 * - IDs are lowercased, and an `openai/` prefix and a `-YYYY-MM-DD` snapshot
 *   suffix are stripped first, so `openai/GPT-6-Sol-2026-09-22` is `gpt-6-sol`.
 * - The GPT-6 tool rules come from OpenAI's GPT-6 guide as seen in search
 *   snippets (October 2026), not from a live request. To check them, send one
 *   Chat Completions request with a function tool to `gpt-6.1-sol` (expect a
 *   Responses API error) and one to `gpt-6-luna` with `reasoning_effort:
 *   "none"` (expect success), then correct `RESPONSES_ONLY_TOOLS` and
 *   `REASONING_NONE_TOOLS` if the API disagrees.
 *
 * @module lib/llm/openai-params
 */

/** Default for new providers: current, off every retirement list, and handled by Chat Completions. */
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"

/**
 * How a model handles function tools in Chat Completions.
 * - `yes`: tools work as sent.
 * - `reasoning-none`: tools work only with `reasoning_effort: "none"`.
 * - `responses-only`: tools need the Responses API, which this app does not use yet.
 *
 * @internal
 */
export type ChatToolSupport = "yes" | "reasoning-none" | "responses-only"

export interface OpenAIModelCaps {
  tokenParam: "max_tokens" | "max_completion_tokens"
  acceptsTemperature: boolean
  structuredOutputs: boolean
  chatTools: ChatToolSupport
}

export interface OpenAIRequestParams {
  max_tokens?: number
  max_completion_tokens?: number
  temperature?: number
  reasoning_effort?: "none"
}

const REASONING_MODEL = /^(gpt-5|gpt-6|o\d)/
const STRUCTURED_OUTPUTS = /^(gpt-4o|gpt-4\.1|gpt-5|gpt-6|o3|o4)/
const RESPONSES_ONLY_TOOLS = new Set(["gpt-6-astra", "gpt-6.1-sol"])
const REASONING_NONE_TOOLS = new Set(["gpt-6-sol", "gpt-6-luna"])

/**
 * Normalize a model ID for capability and price lookups.
 *
 * @example
 * ```ts
 * normalizeOpenAIModelId("openai/GPT-6-Sol-2026-09-22") // "gpt-6-sol"
 * ```
 */
export function normalizeOpenAIModelId(model: string): string {
  return model
    .trim()
    .toLowerCase()
    .replace(/^openai\//, "")
    .replace(/-\d{4}-\d{2}-\d{2}$/, "")
}

function chatToolSupport(id: string): ChatToolSupport {
  if (RESPONSES_ONLY_TOOLS.has(id)) return "responses-only"
  if (REASONING_NONE_TOOLS.has(id)) return "reasoning-none"
  return "yes"
}

/**
 * Capabilities of an OpenAI model, inferred from its ID.
 *
 * @example
 * ```ts
 * openAIModelCaps("gpt-6-luna")
 * // { tokenParam: "max_completion_tokens", acceptsTemperature: false,
 * //   structuredOutputs: true, chatTools: "reasoning-none" }
 * ```
 */
export function openAIModelCaps(model: string): OpenAIModelCaps {
  const id = normalizeOpenAIModelId(model)
  const reasoning = REASONING_MODEL.test(id)
  return {
    tokenParam: reasoning ? "max_completion_tokens" : "max_tokens",
    acceptsTemperature: !reasoning,
    structuredOutputs: STRUCTURED_OUTPUTS.test(id),
    chatTools: chatToolSupport(id),
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
