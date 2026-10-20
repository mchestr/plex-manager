/**
 * The two model calls of the copy step (design 8.5, 8.7): the copy call on
 * the configured model and one repair call on the budget model that sends
 * only the failing slots with their grounding hints.
 *
 * Both wait for a point of the `rw:llm` limit (30 calls a minute per
 * provider) before calling, and both run under the job's signal plus a 90 s
 * timeout. Neither throws for a model failure: `generateStructured` returns
 * typed errors and records every billed attempt.
 *
 * @module lib/wrapped/pipeline/copy-llm
 */

import { setTimeout as sleep } from "node:timers/promises"

import { z } from "zod"

import type { GenerateStructuredInput, StructuredResult } from "@/lib/llm/generate-structured"
import type { UsageAttribution } from "@/lib/llm/usage"
import type { ConsumeResult } from "@/lib/security/rate-limit"
import { RewindCopyV3Wire } from "@/lib/wrapped/copy/schema"
import type { GroundingIssue } from "@/lib/wrapped/copy/grounding"
import { PROMPT_VERSION, systemPrompt, userPrompt, type UserPromptInput } from "@/lib/wrapped/prompt/rewind-2026"

import type { TextSlotId } from "./copy-draft"

const CALL_TIMEOUT_MS = 90_000
const MAX_OUTPUT_TOKENS = 1800

/** `generateStructured`, injectable for tests and the eval harness. */
export type GenerateFn = <S extends z.ZodType>(input: GenerateStructuredInput<S>) => Promise<StructuredResult<z.infer<S>>>

export interface LlmCall {
  generate: GenerateFn
  /** `consume("rw:llm", provider)`. */
  consume: (provider: string) => Promise<ConsumeResult>
  provider: string
  signal: AbortSignal
  attribution: UsageAttribution
  styleGuide: string | null
}

/** Waits, bounded by the signal, until the provider's `rw:llm` limit has a point. */
async function waitForSlot(call: LlmCall): Promise<void> {
  for (;;) {
    const limit = await call.consume(call.provider)
    if (limit.ok) return
    await sleep(limit.retryAfterSec * 1000, undefined, { signal: call.signal })
  }
}

function base(call: LlmCall, modelOverride: string | undefined) {
  return {
    purpose: "wrapped" as const,
    system: systemPrompt(call.styleGuide),
    effort: "low" as const,
    maxOutputTokens: MAX_OUTPUT_TOKENS,
    cacheKey: PROMPT_VERSION,
    signal: AbortSignal.any([call.signal, AbortSignal.timeout(CALL_TIMEOUT_MS)]),
    attribution: call.attribution,
    modelOverride,
  }
}

/** The copy call: the whole wire schema for the selected slots. */
export async function callCopy(call: LlmCall, input: UserPromptInput, modelOverride: string | undefined) {
  await waitForSlot(call)
  return call.generate({ ...base(call, modelOverride), schema: RewindCopyV3Wire, prompt: userPrompt(input) })
}

/** A slot id as a JSON property name every provider accepts. */
const repairKey = (id: TextSlotId) => id.replace(/\./g, "_")

/**
 * The repair call: only the failing slots, each with its issues and hints,
 * and the same fact sheet. Returns the rewritten text by slot, or null when
 * the call failed.
 */
export async function callRepair(
  call: LlmCall,
  input: UserPromptInput,
  failing: ReadonlyMap<TextSlotId, GroundingIssue[]>,
  modelOverride: string | undefined
): Promise<{ texts: Map<TextSlotId, string> | null; result: StructuredResult<unknown> }> {
  const ids = [...failing.keys()]
  const schema = z.strictObject(Object.fromEntries(ids.map((id) => [repairKey(id), z.string()])))
  const issues = ids.flatMap((id) => failing.get(id)!.map((issue) => `- ${id}: ${issue.message}. ${issue.hint}.`))
  const prompt = [
    userPrompt({ ...input, slots: ids }),
    `These slots failed the checks. Rewrite only them, fixing every issue:\n${issues.join("\n")}`,
    `Return one JSON object with the keys ${ids.map(repairKey).join(", ")}.`,
  ].join("\n\n")
  await waitForSlot(call)
  const result = await call.generate({ ...base(call, modelOverride), schema, prompt })
  if (!result.ok) return { texts: null, result }
  const output = result.value.output as Record<string, string>
  return { texts: new Map(ids.map((id) => [id, output[repairKey(id)]])), result }
}
