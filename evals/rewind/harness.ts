/**
 * Runs one golden fixture through the real v3 pipeline in dry-run mode
 * (P5.13): `generateUserRewind` with the fixture's own inputs, a context
 * that needs no database, no rate limit, and a model that is either live
 * (built from an API key in the environment) or a replay of a recording.
 *
 * ```
 * fixture ─► fixtureInputs ─► generateUserRewind({ mode: "dry-run", source })
 *                               └─ generateStructured ─► live model │ replay
 *                                    └─ every call ─► RecordedCall (cost, latency, answer)
 * ```
 *
 * Used by `run.ts`, the recordings test and P5.9's golden test.
 *
 * @module evals/rewind/harness
 */

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { MockLanguageModelV4 } from "ai/test"
import type { z } from "zod"

import type { LLMProvider } from "@/lib/generated/prisma/client"
import { generateStructured, type GenerateStructuredInput, type StructuredDeps, type StructuredResult } from "@/lib/llm/generate-structured"
import { costUsd, lookupModel, type TokenUsage } from "@/lib/llm/models"
import type { ResolvedModel } from "@/lib/llm/registry"
import { RewindCopyV3Wire } from "@/lib/wrapped/copy/schema"
import type { GenerateFn } from "@/lib/wrapped/pipeline/copy-llm"
import { generateUserRewind, type GenerateUserResult } from "@/lib/wrapped/pipeline/generate-user"
import type { RewindContext } from "@/lib/wrapped/pipeline/load-context"
import { resolveZone } from "@/lib/wrapped/time/zone"

import { fixtureInputs, type FixtureInputs } from "./__tests__/member-stats"
import { FIXTURE_USER_ID } from "./__tests__/stats-inputs"
import type { Fixture } from "./fixture-schema"
import type { ModelRef } from "./model-ref"
import { recordingSchema, type RecordedCall, type Recording } from "./recording-schema"

/** @internal */
export const RECORDINGS_DIR = path.join(process.cwd(), "evals", "rewind", "recordings")

export function readRecording(set: string, fixtureId: string): Recording {
  return recordingSchema.parse(JSON.parse(readFileSync(path.join(RECORDINGS_DIR, set, `${fixtureId}.json`), "utf8")))
}

/** Every recording set committed beside `hand/`. @internal */
export function recordingSets(): string[] {
  return readdirSync(RECORDINGS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort()
}

/** A provider row that exists only for this run; its key comes from the environment. */
export function evalRow(ref: ModelRef, options: { apiKey?: string; baseUrl?: string | null; effort?: string | null } = {}): LLMProvider {
  return {
    id: `eval-${ref.provider}`,
    provider: ref.provider,
    purpose: "wrapped",
    apiKey: options.apiKey ?? "",
    model: ref.id,
    temperature: null,
    maxTokens: null,
    baseUrl: options.baseUrl ?? null,
    effort: options.effort ?? null,
    isActive: true,
    createdAt: new Date(0),
    updatedAt: new Date(0),
  }
}

/** The dry-run context of a fixture member: an admin run on a server with Rewind on and no database. */
function fixtureContext(fixture: Fixture, inputs: FixtureInputs, model: ModelRef): RewindContext {
  return {
    userId: FIXTURE_USER_ID,
    year: fixture.window.year,
    kind: "admin",
    through: `${fixture.window.year}-${fixture.window.finalCut ? "12-31" : "11-30"}`,
    finalCut: fixture.window.finalCut,
    member: { userId: FIXTURE_USER_ID, name: fixture.member.userName ?? fixture.member.displayName, plexUserId: "1", isAdmin: true },
    zone: resolveZone({ timezone: fixture.member.timezone }, fixture.server.zone),
    window: inputs.ctx.window,
    config: {
      rewindEnabled: true,
      rewindAudience: "all",
      rewindIncludeManagedUsers: false,
      stripeEnabled: false,
      llmDisabled: false,
      llmMode: "standard",
      budgetUsd: 10,
      locale: "en-US",
      excludedSectionIds: [],
      excludedContentRatings: [],
      disabledPages: [],
    },
    tautulli: { url: "http://tautulli", apiKey: "key" },
    overseerr: null,
    hiddenKeys: inputs.ctx.hiddenKeys,
    aggregate: null,
    serial: "K7Q4",
    nthRewind: 1,
    wrappedId: "wrapped-1",
    previous: null,
    llmProvider: { provider: model.provider, model: model.id },
    spentUsd: 0,
    styleGuide: null,
  }
}

export interface FixtureRun {
  result: GenerateUserResult
  /** Every model call, in order, as it would be recorded. */
  calls: RecordedCall[]
  /** Wall time of the pipeline run. */
  wallMs: number
}

/** Runs one fixture in dry-run mode on the given model calls; see the module comment. */
export async function runFixture(fixture: Fixture, model: ModelRef, deps: StructuredDeps, options: { mode?: "dry-run" | "persist" } = {}): Promise<FixtureRun> {
  const inputs = await fixtureInputs(fixture)
  const calls: RecordedCall[] = []
  const generate = recordingGenerate((input) => generateStructured(input, deps), calls)
  const mode = options.mode ?? "dry-run"
  const started = performance.now()
  const result = await generateUserRewind(
    {
      userId: FIXTURE_USER_ID,
      year: fixture.window.year,
      kind: "admin",
      mode,
      copyPolicy: "default",
      signal: new AbortController().signal,
      generationId: mode === "persist" ? "gen-1" : undefined,
      source: async () => ({ events: inputs.events, sources: inputs.sources }),
    },
    {
      loadContext: async () => fixtureContext(fixture, inputs, model),
      checkEligibility: async () => ({ ok: true }),
      generate,
      consume: async () => ({ ok: true }),
    }
  )
  return { result, calls, wallMs: Math.round(performance.now() - started) }
}

const FAILURE: Partial<Record<string, RecordedCall["finishReason"]>> = {
  TRUNCATED: "length",
  REFUSAL: "refusal",
  CONTENT_FILTER: "content-filter",
  PROVIDER: "error",
  ABORTED: "error",
  NOT_CONFIGURED: "error",
}

/** A call as a recording keeps it. */
function toRecordedCall(kind: RecordedCall["kind"], result: StructuredResult<unknown>, latencyMs: number): RecordedCall {
  if (result.ok) {
    const { output, modelId, usage } = result.value
    return { kind, output: output as Record<string, unknown>, modelId, usage, latencyMs }
  }
  const { code, rawText, modelId, usage } = result.error
  const finishReason = FAILURE[code]
  return {
    kind,
    ...(finishReason ? { finishReason } : {}),
    ...(rawText !== undefined || !finishReason ? { text: rawText ?? "" } : {}),
    ...(modelId ? { modelId } : {}),
    ...(usage ? { usage } : {}),
    latencyMs,
  }
}

/** Wraps the model call so each call is kept, timed, as a recording would hold it. */
function recordingGenerate(generate: GenerateFn, calls: RecordedCall[]): GenerateFn {
  return async <S extends z.ZodType>(input: GenerateStructuredInput<S>) => {
    const started = performance.now()
    const result = await generate(input)
    calls.push(toRecordedCall((input.schema as z.ZodType) === RewindCopyV3Wire ? "copy" : "repair", result, Math.round(performance.now() - started)))
    return result
  }
}

const ZERO_USAGE: TokenUsage = { inputTokens: 0, cachedInputTokens: 0, outputTokens: 0, reasoningTokens: 0 }

const FINISH = {
  length: { unified: "length", raw: "max_tokens" },
  refusal: { unified: "other", raw: "refusal" },
  "content-filter": { unified: "content-filter", raw: "content_filter" },
} as const

/**
 * A model that answers each call with the recording's next reply, through
 * the real `generateStructured`. `next()` is how many calls it answered.
 */
export function replayDeps(recording: Recording, model: ModelRef, record: StructuredDeps["record"] = async () => {}): { deps: StructuredDeps; next: () => number } {
  let next = 0
  const mock = new MockLanguageModelV4({
    doGenerate: async () => {
      const call = recording.calls[next++]
      if (!call) throw new Error(`${recording.fixture}: more model calls than recorded`)
      if (call.finishReason === "error") throw new Error(`${recording.fixture}: the recorded call failed`)
      const usage = call.usage ?? ZERO_USAGE
      return {
        content: [{ type: "text", text: call.output !== undefined ? JSON.stringify(call.output) : (call.text ?? "") }],
        finishReason: call.finishReason ? FINISH[call.finishReason] : { unified: "stop", raw: "end_turn" },
        usage: {
          inputTokens: {
            total: usage.inputTokens,
            noCache: usage.inputTokens - usage.cachedInputTokens,
            cacheRead: usage.cachedInputTokens,
            cacheWrite: usage.cacheWriteTokens ?? 0,
          },
          outputTokens: { total: usage.outputTokens, text: usage.outputTokens - usage.reasoningTokens, reasoning: usage.reasoningTokens },
        },
        warnings: [],
        response: { id: `${recording.fixture}-${next}`, modelId: call.modelId ?? model.id, timestamp: new Date(0) },
      }
    },
  })
  const row = evalRow(model)
  const deps: StructuredDeps = {
    resolve: async (_purpose, override): Promise<ResolvedModel> => ({ model: mock, info: lookupModel(model.provider, override.model ?? model.id), row }),
    record,
  }
  return { deps, next: () => next }
}

/** The cost of the recorded calls at today's prices (failed billed calls included). */
export function recordedCost(calls: readonly RecordedCall[], model: ModelRef): number {
  return calls.reduce((sum, call) => {
    if (!call.usage) return sum
    const info = lookupModel(model.provider, call.modelId ?? model.id)
    return sum + (info.pricing ? costUsd(info, call.usage) : 0)
  }, 0)
}
