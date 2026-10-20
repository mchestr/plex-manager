/**
 * One eval run's results file, `evals/rewind/results/<date>-<model>.json`
 * (P5.13), and the `RewindEvalRun.results` column. The bake-off reads these
 * files back through `selectModel`.
 *
 * @module evals/rewind/results-schema
 */

import { z } from "zod"

const rate = z.number().min(0).max(1).nullable()

export const judgeScores = z.object({
  voice: z.number().min(1).max(5),
  specificity: z.number().min(1).max(5),
  warmth: z.number().min(1).max(5),
  restraint: z.number().min(1).max(5),
  faithfulness: z.number().min(1).max(5),
})

export type JudgeScores = z.infer<typeof judgeScores>

const checkIssue = z.object({
  fixture: z.string().nullable(),
  check: z.enum(["schema", "grounding", "archetype-spread", "overlap"]),
  slot: z.string().optional(),
  message: z.string(),
})

const fixtureResult = z.object({
  id: z.string(),
  edition: z.enum(["full", "pocket", "postcard"]),
  archetype: z.string().nullable(),
  copySource: z.enum(["llm", "repair", "template", "mixed"]),
  calls: z.number().int().nonnegative(),
  latencyMs: z.number().nonnegative(),
  costUsd: z.number().nonnegative(),
  slots: z.number().int().nonnegative(),
  firstPassFailed: z.array(z.string()),
  afterRepairFailed: z.array(z.string()),
  reason: z.string().nullable(),
  /** Each slot's final origin and rendered text. */
  copy: z.array(z.object({ slot: z.string(), origin: z.enum(["llm", "repair", "template"]), text: z.string() })),
  judge: z.object({ scores: judgeScores, mean: z.number(), notes: z.string() }).nullable(),
})

export const evalResults = z.object({
  version: z.literal(1),
  /** `<provider>:<id>`, or `replay:<set>` for a replay with no model on record. */
  model: z.string(),
  source: z.enum(["live", "replay"]),
  /** The recording set a replay read. */
  recordings: z.string().nullable(),
  judge: z.string().nullable(),
  promptVersion: z.string(),
  effort: z.string().nullable(),
  startedAt: z.string(),
  fixtures: z.array(fixtureResult),
  rates: z.object({ firstPass: rate, afterRepair: rate }),
  gates: z.object({
    passed: z.boolean(),
    issues: z.array(checkIssue),
    archetypes: z.record(z.string(), z.number()),
    maxOverlap: z.object({ pair: z.tuple([z.string(), z.string()]), value: z.number() }).nullable(),
  }),
  /** Advisory only: the mean of the judged fixtures' means. */
  judgeMean: z.number().nullable(),
  cost: z.object({ estimateUsd: z.number(), generationUsd: z.number(), judgeUsd: z.number(), totalUsd: z.number() }),
  latencyMs: z.object({ p50: z.number(), p95: z.number() }),
})

export type EvalResults = z.infer<typeof evalResults>
export type FixtureResult = z.infer<typeof fixtureResult>
