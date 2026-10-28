/**
 * The "About the words" line (Rewind design 8.1, GAP-34): who wrote the
 * issue's words and what that model received.
 *
 * `copyMeta.model` is `"<provider>:<model id>"`; a bare id is matched against
 * the hosted catalogue. A model on an OpenAI-compatible server, or a bare id
 * the catalogue does not know, is named "a model running on this server".
 * Issues whose words are all templates, or that record no model, have no
 * line: the Settings sheet leaves "About the words" out.
 *
 * @module lib/rewind/copy-disclosure
 */

import { listKnownModels, lookupModel, normalizeModelId } from "@/lib/llm/models"
import { isLLMProviderId, LLM_PROVIDER_LABELS } from "@/lib/llm/provider-presets"

const RECEIVED = "It received your titles and totals, never your email or anything about other members."

export interface CopyAuthor {
  copySource: "llm" | "repair" | "template" | "mixed"
  model: string | null
}

function author(model: string): string {
  const split = model.indexOf(":")
  const prefix = split > 0 ? model.slice(0, split) : ""
  if (isLLMProviderId(prefix)) {
    if (prefix === "openai-compatible") return "a model running on this server"
    return `${lookupModel(prefix, model.slice(split + 1)).displayName} (${LLM_PROVIDER_LABELS[prefix]})`
  }
  const id = normalizeModelId(model)
  const info = listKnownModels().find((m) => m.id === id && m.provider !== "openai-compatible")
  return info ? `${info.displayName} (${LLM_PROVIDER_LABELS[info.provider]})` : "a model running on this server"
}

/**
 * @example
 * ```ts
 * aboutTheWords({ copySource: "llm", model: "anthropic:claude-sonnet-5-5" })
 * // "Some of the words were written by Claude Sonnet 5.5 (Anthropic). It received your titles and totals, never your email or anything about other members."
 * aboutTheWords({ copySource: "template", model: null }) // null
 * ```
 */
export function aboutTheWords({ copySource, model }: CopyAuthor): string | null {
  if (copySource === "template" || model === null) return null
  return `Some of the words were written by ${author(model)}. ${RECEIVED}`
}
