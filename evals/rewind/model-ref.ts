/**
 * Model references for the eval harness: `<provider>:<id>` on the command
 * line, the family a judge must differ from, and the slug used in file names.
 *
 * Pure: no keys, no network.
 *
 * @module evals/rewind/model-ref
 */

import { normalizeModelId, type LLMProviderId } from "@/lib/llm/models"
import { isLLMProviderId } from "@/lib/llm/provider-presets"

export interface ModelRef {
  provider: LLMProviderId
  id: string
}

/** `anthropic:claude-sonnet-5-5` to its parts; `ollama:` is short for `openai-compatible:`. */
export function parseModelRef(value: string): ModelRef {
  const at = value.indexOf(":")
  if (at < 1 || at === value.length - 1) throw new Error(`"${value}" is not <provider>:<model>`)
  const head = value.slice(0, at)
  const provider = head === "ollama" ? "openai-compatible" : head
  if (!isLLMProviderId(provider)) throw new Error(`"${head}" is not a provider (openai, anthropic, google, openai-compatible)`)
  return { provider, id: value.slice(at + 1) }
}

export const formatModelRef = (ref: ModelRef) => `${ref.provider}:${ref.id}`

/**
 * The model family: the provider, except on an OpenAI-compatible server,
 * where the model's own name says who trained it (a local Gemma is Google's).
 */
export function modelFamily(ref: ModelRef): string {
  if (ref.provider !== "openai-compatible") return ref.provider
  const id = normalizeModelId(ref.id)
  if (/^(gpt|o\d)/.test(id)) return "openai"
  if (id.startsWith("claude")) return "anthropic"
  if (/^(gemini|gemma)/.test(id)) return "google"
  return id.match(/^[a-z]+/)?.[0] ?? id
}

/** A file-name-safe name for a model or a recording set: `anthropic-claude-sonnet-5-5`. */
export function slugFor(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9.]+/g, "-")
    .replace(/^-+|-+$/g, "")
}
