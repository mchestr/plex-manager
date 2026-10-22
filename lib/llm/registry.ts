import "server-only"

import { createAnthropic } from "@ai-sdk/anthropic"
import { createGoogleGenerativeAI } from "@ai-sdk/google"
import { createOpenAI } from "@ai-sdk/openai"
import { createOpenAICompatible } from "@ai-sdk/openai-compatible"
import type { LanguageModel } from "ai"

import type { LLMProvider } from "@/lib/generated/prisma/client"
import { lookupModel, type ModelInfo } from "@/lib/llm/models"
import { isLLMProviderId } from "@/lib/llm/provider-presets"
import { prisma } from "@/lib/prisma"
import { frozenModelFor, REWIND_LOCK, type FrozenRewindModel } from "@/lib/wrapped/freeze/lock"

export type LLMPurpose = "wrapped" | "chat"

/** A provider row that cannot build a model, e.g. an OpenAI-compatible row with no base URL. */
export class LLMConfigError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "LLMConfigError"
  }
}

export interface ResolvedModel {
  model: LanguageModel
  info: ModelInfo
  row: LLMProvider
}

type ModelFactory = (modelId: string) => LanguageModel

function createFactory(row: LLMProvider): ModelFactory {
  switch (row.provider) {
    case "openai":
      // The OpenAI provider builds Responses API models by default
      return createOpenAI({ apiKey: row.apiKey })
    case "anthropic":
      return createAnthropic({ apiKey: row.apiKey })
    case "google":
      return createGoogleGenerativeAI({ apiKey: row.apiKey })
    case "openai-compatible": {
      if (!row.baseUrl) {
        throw new LLMConfigError("An OpenAI-compatible provider needs a base URL")
      }
      const provider = createOpenAICompatible({
        name: "openai-compatible",
        baseURL: row.baseUrl,
        // A local server such as Ollama has no key
        apiKey: row.apiKey || undefined,
        supportsStructuredOutputs: true,
        includeUsage: true,
      })
      return (modelId) => provider.chatModel(modelId)
    }
    default:
      throw new LLMConfigError(`Unsupported LLM provider: ${row.provider}`)
  }
}

// Keyed by row id and updatedAt, so a saved change (new key, URL or provider) builds a fresh client
const factories = new Map<string, ModelFactory>()

function factoryFor(row: LLMProvider): ModelFactory {
  const key = `${row.id}:${row.updatedAt.getTime()}`
  let factory = factories.get(key)
  if (!factory) {
    for (const existing of factories.keys()) {
      if (existing.startsWith(`${row.id}:`)) factories.delete(existing)
    }
    factory = createFactory(row)
    factories.set(key, factory)
  }
  return factory
}

/**
 * Build the model for a provider row. Throws `LLMConfigError` when the row
 * cannot build one.
 */
export function resolveModel(row: LLMProvider, modelId: string = row.model): ResolvedModel {
  if (!isLLMProviderId(row.provider)) {
    throw new LLMConfigError(`Unsupported LLM provider: ${row.provider}`)
  }
  if (!modelId) {
    throw new LLMConfigError("No model is configured for this provider")
  }
  return { model: factoryFor(row)(modelId), info: lookupModel(row.provider, modelId), row }
}

/**
 * The model for a purpose, from its active `LLMProvider` row (whose key
 * `ENCRYPTED_FIELDS` has already decrypted). Null when no row is active;
 * throws `LLMConfigError` when the row cannot build a model.
 */
export async function getLanguageModel(
  purpose: LLMPurpose,
  override?: { model?: string }
): Promise<ResolvedModel | null> {
  const row = await prisma.lLMProvider.findFirst({ where: { isActive: true, purpose } })
  if (!row) return null
  return resolveModel(row, override?.model ?? row.model)
}

/**
 * The model Rewind's copy step writes with (P8.1): the freeze lock's model on
 * the key of the active `wrapped` row, the row's own model while the lock has
 * none, a `mismatch` when the row names another provider than the lock (the
 * copy step then writes templates), or null with no active row. See
 * `lib/wrapped/freeze/lock.ts`.
 */
export async function getFrozenRewindModel(): Promise<FrozenRewindModel | null> {
  const row = await prisma.lLMProvider.findFirst({ where: { isActive: true, purpose: "wrapped" }, select: { provider: true, model: true } })
  return frozenModelFor(row, REWIND_LOCK.model)
}
