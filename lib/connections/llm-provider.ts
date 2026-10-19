import "server-only"

import { z } from "zod"

import { isConnectionTestBypassed } from "@/lib/connections/connection-test"
import { serviceErrorMessage, serviceFetch, type ServiceResult } from "@/lib/connections/http"
import type { LLMProviderId } from "@/lib/llm/model-catalog"
import { listKnownModels, normalizeModelId } from "@/lib/llm/models"
import { DEFAULT_OPENAI_MODEL, LLM_PROVIDER_LABELS } from "@/lib/llm/provider-presets"

/**
 * Model listing and connection tests for the LLM providers.
 *
 * Every call goes through `serviceFetch`: a 5 s budget, redirects that drop
 * the key on a cross-origin hop, Zod-parsed bodies, and fixed error messages
 * that carry at most the status code, never the upstream body (SEC-44).
 *
 * | Provider | Request | Key header |
 * |----------|---------|------------|
 * | `openai` | `GET https://api.openai.com/v1/models` | `Authorization: Bearer` |
 * | `anthropic` | `GET https://api.anthropic.com/v1/models` | `x-api-key`, `anthropic-version: 2023-06-01` |
 * | `google` | `GET https://generativelanguage.googleapis.com/v1beta/models` | `x-goog-api-key` |
 * | `openai-compatible` | `GET {baseUrl}/models` | `Authorization: Bearer`, when a key is set |
 *
 * @module lib/connections/llm-provider
 */

export interface ProviderModelsConfig {
  provider: LLMProviderId
  apiKey?: string
  baseUrl?: string
}

const TIMEOUT_MS = 5_000

const idListSchema = z.looseObject({ data: z.array(z.looseObject({ id: z.string() })) })
const googleListSchema = z.looseObject({
  models: z
    .array(z.looseObject({ name: z.string(), supportedGenerationMethods: z.array(z.string()).optional() }))
    .default([]),
})

interface ListRequest {
  url: string
  headers: Record<string, string>
  schema: z.ZodType<string[]>
}

function listRequest({ provider, apiKey, baseUrl }: ProviderModelsConfig): ListRequest {
  const ids = idListSchema.transform((body) => body.data.map((model) => model.id))
  const bearer: Record<string, string> = apiKey ? { Authorization: `Bearer ${apiKey}` } : {}
  switch (provider) {
    case "openai":
      return { url: "https://api.openai.com/v1/models", headers: bearer, schema: ids }
    case "anthropic":
      return {
        url: "https://api.anthropic.com/v1/models?limit=1000",
        headers: { "x-api-key": apiKey ?? "", "anthropic-version": "2023-06-01" },
        schema: ids,
      }
    case "google":
      return {
        url: "https://generativelanguage.googleapis.com/v1beta/models?pageSize=1000",
        headers: { "x-goog-api-key": apiKey ?? "" },
        schema: googleListSchema.transform((body) =>
          body.models
            .filter((model) => !model.supportedGenerationMethods || model.supportedGenerationMethods.includes("generateContent"))
            .map((model) => model.name.replace(/^models\//, ""))
        ),
      }
    case "openai-compatible":
      return { url: `${(baseUrl ?? "").replace(/\/+$/, "")}/models`, headers: bearer, schema: ids }
  }
}

/**
 * The model ids a provider offers, sorted. Never throws. Callers use
 * {@link loadProviderModels}, which adds the test bypass and fixed messages.
 *
 * @internal
 */
export async function listProviderModels(
  config: ProviderModelsConfig,
  options: { signal?: AbortSignal } = {}
): Promise<ServiceResult<string[]>> {
  if (config.provider === "openai-compatible" && !config.baseUrl) return { ok: false, code: "NETWORK" }
  const request = listRequest(config)
  const result = await serviceFetch({
    service: LLM_PROVIDER_LABELS[config.provider],
    url: request.url,
    headers: request.headers,
    schema: request.schema,
    timeoutMs: TIMEOUT_MS,
    signal: options.signal,
  })
  return result.ok ? { ok: true, data: [...new Set(result.data)].sort() } : result
}

/** What the bypassed connection test (Jest and the E2E server) reports. */
function bypassModels(provider: LLMProviderId): string[] {
  if (provider === "openai") return [DEFAULT_OPENAI_MODEL, "gpt-6-sol", "gpt-6-luna"]
  if (provider === "openai-compatible") return ["qwen3.6:27b"]
  return listKnownModels(provider).map((info) => info.id)
}

function failureMessage(provider: LLMProviderId, failure: Exclude<ServiceResult<string[]>, { ok: true }>): string {
  if (failure.code === "HTTP" && (failure.status === 401 || failure.status === 403)) return "Invalid API key"
  return serviceErrorMessage(LLM_PROVIDER_LABELS[provider], failure)
}

/** {@link listProviderModels} in the forms' `{ success, models, error }` shape, with fixed messages. */
export async function loadProviderModels(
  config: ProviderModelsConfig
): Promise<{ success: true; models: string[] } | { success: false; error: string }> {
  if (isConnectionTestBypassed()) return { success: true, models: bypassModels(config.provider) }
  const result = await listProviderModels(config)
  return result.ok ? { success: true, models: result.data } : { success: false, error: failureMessage(config.provider, result) }
}

/**
 * Passes when the model list loads and the chosen model is in it, or was
 * entered as a custom id (a list can leave out models the key can still use).
 */
export async function testLLMProviderConnection(
  config: ProviderModelsConfig & { model?: string },
  options: { customModel?: boolean } = {}
): Promise<{ success: boolean; error?: string }> {
  if (isConnectionTestBypassed()) return { success: true }
  const loaded = await loadProviderModels(config)
  if (!loaded.success) return loaded
  if (!config.model || options.customModel) return { success: true }
  const wanted = normalizeModelId(config.model)
  if (loaded.models.some((id) => id === config.model || normalizeModelId(id) === wanted)) return { success: true }
  return {
    success: false,
    error: `${LLM_PROVIDER_LABELS[config.provider]} does not list the model "${config.model}". Choose one from the list or enter it as a custom model.`,
  }
}
