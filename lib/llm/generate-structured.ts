import "server-only"

import {
  APICallError,
  generateText,
  NoObjectGeneratedError,
  Output,
  RetryError,
  type LanguageModelUsage,
} from "ai"
import type { z } from "zod"

import { costUsd, lookupModel, resolveEffort, type EffortLevel, type TokenUsage } from "@/lib/llm/models"
import { getLanguageModel, LLMConfigError, type LLMPurpose, type ResolvedModel } from "@/lib/llm/registry"
import { recordUsage, type UsageAttribution, type UsageOutcome } from "@/lib/llm/usage"
import { createLogger } from "@/lib/utils/logger"
import { EFFORT_LEVELS } from "@/lib/validations/llm-provider"

const logger = createLogger("LLM_STRUCTURED")

type ProviderOptions = NonNullable<Parameters<typeof generateText>[0]["providerOptions"]>

type StructuredErrorCode =
  | "NOT_CONFIGURED"
  | "TRUNCATED"
  | "CONTENT_FILTER"
  | "REFUSAL"
  | "SCHEMA"
  | "ABORTED"
  | "PROVIDER"

interface StructuredError {
  code: StructuredErrorCode
  message: string
  /** The raw model text of a `SCHEMA` failure, for a repair call. */
  rawText?: string
  usage?: TokenUsage
  modelId?: string
}

interface StructuredSuccess<T> {
  output: T
  usage: TokenUsage
  cost: number
  modelId: string
  finishReason: string
  rawText: string
}

export type StructuredResult<T> = { ok: true; value: StructuredSuccess<T> } | { ok: false; error: StructuredError }

export interface GenerateStructuredInput<S extends z.ZodType> {
  purpose: LLMPurpose
  schema: S
  system: string
  prompt: string
  /** The caller's default; the provider row's `effort`, when an admin set one, wins. */
  effort?: EffortLevel
  /** Falls back to the provider row's `maxTokens`. */
  maxOutputTokens?: number
  /** Falls back to the provider row's `temperature`; dropped where the model takes none. */
  temperature?: number
  /** OpenAI `promptCacheKey`. Anthropic caches the system block whenever it is set. */
  cacheKey?: string
  signal?: AbortSignal
  attribution: UsageAttribution
  /** A different model on the purpose's provider, e.g. from the playground. */
  modelOverride?: string
  /** Kept on the usage row (the admin LLM history shows it). */
  recordText?: boolean
}

/** What the last step returned, captured before the SDK parses the output. */
interface StepSnapshot {
  finishReason: string
  rawFinishReason: string | undefined
  usage: LanguageModelUsage
  modelId: string
  text: string
}

function toTokenUsage(usage: LanguageModelUsage): TokenUsage {
  return {
    inputTokens: usage.inputTokens ?? 0,
    cachedInputTokens: usage.inputTokenDetails?.cacheReadTokens ?? 0,
    cacheWriteTokens: usage.inputTokenDetails?.cacheWriteTokens ?? 0,
    outputTokens: usage.outputTokens ?? 0,
    reasoningTokens: usage.outputTokenDetails?.reasoningTokens ?? 0,
  }
}

/**
 * The provider options for effort and caching, under each provider's own names.
 */
export function providerOptionsFor(
  resolved: ResolvedModel,
  effort: EffortLevel | undefined,
  cacheKey: string | undefined
): ProviderOptions {
  const level = effort ? resolveEffort(resolved.info, effort) : null
  switch (resolved.info.provider) {
    case "openai":
      return { openai: { ...(level && { reasoningEffort: level }), ...(cacheKey && { promptCacheKey: cacheKey }) } }
    case "anthropic":
      return { anthropic: { ...(level && { effort: level }) } }
    case "google":
      return { google: { ...(level && { thinkingConfig: { thinkingLevel: level } }) } }
    case "openai-compatible":
      return { "openai-compatible": { ...(level && { reasoningEffort: level }) } }
  }
}

/** The effort an admin chose for the provider row, if any. */
export function rowEffort(row: { effort: string | null }): EffortLevel | undefined {
  return EFFORT_LEVELS.find((level) => level === row.effort)
}

function failureFor(step: StepSnapshot): { code: StructuredErrorCode; outcome: UsageOutcome } | null {
  if (step.finishReason === "length") return { code: "TRUNCATED", outcome: "length" }
  if (step.rawFinishReason === "refusal") return { code: "REFUSAL", outcome: "refusal" }
  if (step.finishReason === "content-filter") return { code: "CONTENT_FILTER", outcome: "content-filter" }
  return null
}

const MESSAGES: Record<StructuredErrorCode, string> = {
  NOT_CONFIGURED: "No active LLM provider is configured for this purpose",
  TRUNCATED: "The model ran out of output tokens before finishing. Raise the token limit or lower the effort.",
  CONTENT_FILTER: "The provider's content filter stopped the response",
  REFUSAL: "The model declined to answer",
  SCHEMA: "The model's answer did not match the expected format",
  ABORTED: "The request was cancelled or timed out",
  PROVIDER: "The LLM provider returned an error",
}

/**
 * One structured LLM call on the purpose's configured provider.
 *
 * Maps `effort` to each provider's option, drops `temperature` where the model
 * rejects it, caches the system block (Anthropic `cacheControl`, OpenAI
 * `promptCacheKey`), retries 429 and 5xx through the SDK (`maxRetries: 2`), and
 * maps finish reasons to typed errors. Every billed attempt, failed or not,
 * writes one usage row; errors with no response (network, abort) write none.
 * Provider and output failures come back as typed errors; it throws only when
 * the provider row itself cannot be read.
 */
export async function generateStructured<S extends z.ZodType>(
  input: GenerateStructuredInput<S>
): Promise<StructuredResult<z.infer<S>>> {
  let resolved: ResolvedModel | null
  try {
    resolved = await getLanguageModel(input.purpose, { model: input.modelOverride })
  } catch (error) {
    if (error instanceof LLMConfigError) return { ok: false, error: { code: "NOT_CONFIGURED", message: error.message } }
    throw error
  }
  if (!resolved) return { ok: false, error: { code: "NOT_CONFIGURED", message: MESSAGES.NOT_CONFIGURED } }

  const { info, row } = resolved
  const temperature = input.temperature ?? row.temperature ?? undefined
  let step: StepSnapshot | null = null

  const record = async (snapshot: StepSnapshot, outcome: UsageOutcome) => {
    const usage = toTokenUsage(snapshot.usage)
    const served = lookupModel(info.provider, snapshot.modelId)
    const cost = costUsd(served.known ? served : info, usage)
    await recordUsage({
      attribution: input.attribution,
      provider: info.provider,
      modelId: snapshot.modelId,
      usage,
      cost,
      outcome,
      prompt: input.recordText ? input.prompt : null,
      response: input.recordText ? snapshot.text : null,
    })
    return { usage, cost }
  }

  try {
    const result = await generateText({
      model: resolved.model,
      instructions: {
        role: "system",
        content: input.system,
        ...(input.cacheKey && { providerOptions: { anthropic: { cacheControl: { type: "ephemeral" } } } }),
      },
      prompt: input.prompt,
      output: Output.object({ schema: input.schema }),
      maxOutputTokens: input.maxOutputTokens ?? row.maxTokens ?? undefined,
      ...(info.capabilities.samplingParams && temperature !== undefined && { temperature }),
      providerOptions: providerOptionsFor(resolved, rowEffort(row) ?? input.effort, input.cacheKey),
      abortSignal: input.signal,
      maxRetries: 2,
      onStepEnd: (event) => {
        step = {
          finishReason: event.finishReason,
          rawFinishReason: event.rawFinishReason,
          usage: event.usage,
          modelId: event.response.modelId,
          text: event.text,
        }
      },
    })
    const snapshot: StepSnapshot = step ?? {
      finishReason: result.finishReason,
      rawFinishReason: result.rawFinishReason,
      usage: result.totalUsage,
      modelId: result.response.modelId,
      text: result.text,
    }
    const failure = failureFor(snapshot)
    if (failure) {
      const { usage } = await record(snapshot, failure.outcome)
      return { ok: false, error: { code: failure.code, message: MESSAGES[failure.code], usage, modelId: snapshot.modelId } }
    }
    const { usage, cost } = await record(snapshot, "ok")
    return {
      ok: true,
      value: {
        output: result.output as z.infer<S>,
        usage,
        cost,
        modelId: snapshot.modelId,
        finishReason: snapshot.finishReason,
        rawText: snapshot.text,
      },
    }
  } catch (error) {
    const snapshot = step as StepSnapshot | null
    if (snapshot) {
      // The provider answered and billed the call, but the output was unusable
      const failure = failureFor(snapshot) ?? { code: "SCHEMA" as const, outcome: "schema" as const }
      const { usage } = await record(snapshot, failure.outcome)
      logger.warn("Structured output failed", { code: failure.code, model: snapshot.modelId })
      return {
        ok: false,
        error: {
          code: failure.code,
          message: MESSAGES[failure.code],
          rawText: NoObjectGeneratedError.isInstance(error) ? (error.text ?? snapshot.text) : snapshot.text,
          usage,
          modelId: snapshot.modelId,
        },
      }
    }
    if (input.signal?.aborted || (error instanceof Error && error.name === "AbortError")) {
      return { ok: false, error: { code: "ABORTED", message: MESSAGES.ABORTED } }
    }
    const cause = RetryError.isInstance(error) ? error.lastError : error
    const status = APICallError.isInstance(cause) ? cause.statusCode : undefined
    logger.error("LLM call failed", error, { provider: info.provider, model: info.id, status })
    // The upstream body is never echoed; the status is enough to tell a bad key from an outage
    const message = status ? `${MESSAGES.PROVIDER} (HTTP ${status})` : MESSAGES.PROVIDER
    return { ok: false, error: { code: "PROVIDER", message } }
  }
}
