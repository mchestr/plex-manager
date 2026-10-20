/**
 * The advisory judge (design 8.6, P5.13): a model from another family scores
 * one fixture's copy on `rubric.md`'s five scales. Its score ranks
 * candidates that already passed the deterministic gates; it never fails one.
 *
 * @module evals/rewind/judge
 */

import { readFileSync } from "node:fs"
import path from "node:path"

import { z } from "zod"

import type { GenerateFn } from "@/lib/wrapped/pipeline/copy-llm"
import type { FactSheet } from "@/lib/wrapped/facts/fact-sheet"

import { formatModelRef, modelFamily, type ModelRef } from "./model-ref"
import { judgeScores, type JudgeScores } from "./results-schema"

/** About what one judged fixture costs (design 8.2), for the estimate. */
export const JUDGE_ESTIMATE_USD = 0.05

const RUBRIC_PATH = path.join(process.cwd(), "evals", "rewind", "rubric.md")

/** Refuses a judge from the generator's own family. */
export function assertCrossFamily(generator: ModelRef, judge: ModelRef): void {
  if (modelFamily(generator) === modelFamily(judge)) {
    throw new Error(`The judge ${formatModelRef(judge)} is from the same family as ${formatModelRef(generator)}; pick a judge from another family`)
  }
}

// Plain numbers: some providers' structured outputs reject `minimum` and `maximum`; the range is checked after
const JudgeWire = z.strictObject({
  voice: z.number(),
  specificity: z.number(),
  warmth: z.number(),
  restraint: z.number(),
  faithfulness: z.number(),
  notes: z.string(),
})

export interface JudgeInput {
  generate: GenerateFn
  rubric: string
  fixture: string
  factSheet: FactSheet
  copy: ReadonlyArray<{ slot: string; text: string }>
  signal: AbortSignal
}

export interface JudgeVerdict {
  scores: JudgeScores
  mean: number
  notes: string
}

export const readRubric = () => readFileSync(RUBRIC_PATH, "utf8")

/** Scores one fixture's copy, or null when the judge's answer is unusable. Its cost reaches the caller's usage recorder. */
export async function judgeFixture(input: JudgeInput): Promise<JudgeVerdict | null> {
  const prompt = [
    `Fact sheet:\n${JSON.stringify(input.factSheet.facts.map(({ id, display }) => ({ id, display })))}`,
    `The issue's lines, by slot:\n${input.copy.map(({ slot, text }) => `- ${slot}: ${text}`).join("\n")}`,
  ].join("\n\n")
  const result = await input.generate({
    purpose: "wrapped",
    schema: JudgeWire,
    system: input.rubric,
    prompt,
    effort: "low",
    maxOutputTokens: 800,
    signal: input.signal,
    attribution: { userId: `eval-judge:${input.fixture}` },
  })
  if (!result.ok) return null
  const { notes, ...raw } = result.value.output
  const scores = judgeScores.safeParse(raw)
  if (!scores.success) return null
  const values = Object.values(scores.data)
  return { scores: scores.data, mean: values.reduce((a, b) => a + b, 0) / values.length, notes }
}
