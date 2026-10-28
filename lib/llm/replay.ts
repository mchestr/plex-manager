/**
 * The replay provider (P7.11): a dry run with the model `replay:selected`
 * answers each model call from the recording of the model that
 * `evals/rewind/selected.json` names (P5.13), through P5.9's recording
 * replay, so the playground's "Selected model, recorded answers" shows the
 * bake-off winner's real copy at no cost.
 *
 * ```
 * selected.json { model: "anthropic:claude-…" }
 *   └─ evals/rewind/recordings/<slug>/<fixture>.json
 *        └─ replayDeps ─► generateStructured (mock model, no usage row)
 * ```
 *
 * No provider is called and no `LLMUsage` row is written. Until the bake-off
 * names a model, or while its recordings are missing, there is nothing to
 * replay and the playground does not offer it.
 *
 * @module lib/llm/replay
 */

import "server-only"

import { readFileSync } from "node:fs"
import path from "node:path"

import { z } from "zod"

import { readRecording, recordingSets, replayDeps } from "@/evals/rewind/harness"
import { parseModelRef, slugFor, type ModelRef } from "@/evals/rewind/model-ref"
import { generateStructured, type GenerateStructuredInput } from "@/lib/llm/generate-structured"
import type { GenerateFn } from "@/lib/wrapped/pipeline/copy-llm"

const SELECTED_PATH = path.join(process.cwd(), "evals", "rewind", "selected.json")

const selectedSchema = z.object({ model: z.string().nullable() })

/** The selected model and the recording set that holds its answers. */
export interface ReplaySource {
  model: ModelRef
  set: string
}

/**
 * The selected model's recordings, or null until `selected.json` names a
 * model whose recording set is committed.
 */
export function selectedReplay(read: () => string = () => readFileSync(SELECTED_PATH, "utf8")): ReplaySource | null {
  const { model } = selectedSchema.parse(JSON.parse(read()))
  if (!model) return null
  const set = slugFor(model)
  return recordingSets().includes(set) ? { model: parseModelRef(model), set } : null
}

/** A model call that answers from `source`'s recording of the fixture, in order; see the module comment. */
export function replayGenerate(source: ReplaySource, fixtureId: string): GenerateFn {
  const { deps } = replayDeps(readRecording(source.set, fixtureId), source.model)
  return <S extends z.ZodType>(input: GenerateStructuredInput<S>) => generateStructured(input, deps)
}
