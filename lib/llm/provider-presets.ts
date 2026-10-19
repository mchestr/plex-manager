/**
 * Provider names, defaults and OpenAI-compatible presets for the LLM settings.
 *
 * Pure, so the admin form (a client component) and the server code read the
 * same values.
 *
 * @module lib/llm/provider-presets
 */

import type { LLMProviderId } from "@/lib/llm/model-catalog"

/** Default for new OpenAI providers: current, off every retirement list. */
export const DEFAULT_OPENAI_MODEL = "gpt-5.4-mini"

export const LLM_PROVIDER_IDS = ["openai", "anthropic", "google", "openai-compatible"] as const satisfies readonly LLMProviderId[]

export const LLM_PROVIDER_LABELS: Record<LLMProviderId, string> = {
  openai: "OpenAI",
  anthropic: "Anthropic",
  google: "Google Gemini",
  "openai-compatible": "OpenAI-compatible server",
}

/** Base URLs for the common OpenAI-compatible servers, offered as presets in the form. */
export const OPENAI_COMPATIBLE_PRESETS = {
  ollama: { label: "Ollama", baseUrl: "http://localhost:11434/v1" },
  lmstudio: { label: "LM Studio", baseUrl: "http://localhost:1234/v1" },
  vllm: { label: "vLLM", baseUrl: "http://localhost:8000/v1" },
  openrouter: { label: "OpenRouter", baseUrl: "https://openrouter.ai/api/v1" },
} as const

export function isLLMProviderId(value: string): value is LLMProviderId {
  return (LLM_PROVIDER_IDS as readonly string[]).includes(value)
}
