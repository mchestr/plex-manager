/**
 * The Rewind eval run (design 8.6, P5.13), behind `npm run eval:rewind`
 * (`run.ts` is the command line).
 *
 * ```
 * options ─► refuse an unpriced model or a same-family judge
 *         ─► print the estimate ─► confirm (unless --yes, or nothing is paid)
 *         ─► each fixture: generateUserRewind (dry run) on a live model or a replay
 *         ─► checks.ts gates ─► advisory judge ─► results JSON ─► RewindEvalRun row
 *         └─ --record: recordings/<model>/<fixture>.json
 * ```
 *
 * The estimate is the design 8.2 budget: about 4,400 input and 1,500 output
 * tokens for each fixture that calls the model (the full editions), at the
 * model's catalogue price, plus about $0.05 a fixture for the judge. A
 * replay pays nothing and reports the recorded cost and latency.
 *
 * @module evals/rewind/run-eval
 */

import type { StructuredDeps } from "@/lib/llm/generate-structured"
import { generateStructured } from "@/lib/llm/generate-structured"
import { costUsd, lookupModel } from "@/lib/llm/models"
import { formatMoney } from "@/lib/utils/format"
import { PROMPT_VERSION } from "@/lib/wrapped/prompt/rewind-2026"

import { checkRun, type RunTrail } from "./checks"
import type { Fixture } from "./fixture-schema"
import { readRecording, recordedCost, replayDeps, runFixture, type FixtureRun } from "./harness"
import { assertCrossFamily, JUDGE_ESTIMATE_USD, judgeFixture, readRubric, type JudgeVerdict } from "./judge"
import { formatModelRef, parseModelRef, slugFor, type ModelRef } from "./model-ref"
import type { Recording } from "./recording-schema"
import { evalResults, type EvalResults, type FixtureResult } from "./results-schema"

/** Tokens per member that calls the model (design 8.2). */
const ESTIMATE_TOKENS = { input: 4400, output: 1500 } as const

/** The model a replay of a set with no model on record (such as `hand`) runs under. */
const REPLAY_DEFAULT: ModelRef = { provider: "anthropic", id: "claude-sonnet-5-5" }

export interface EvalOptions {
  /** `<provider>:<id>`; required unless `replay` is set. */
  model?: string
  /** A recording set to replay instead of calling a model. */
  replay?: string
  judge?: string
  fixtures?: string[]
  record: boolean
  yes: boolean
  allowUnpriced: boolean
  effort?: string
}

export interface EvalIO {
  log: (line: string) => void
  confirm: (question: string) => Promise<boolean>
  now: () => Date
  /** The live model calls for a model, with keys from the environment. */
  liveDeps: (ref: ModelRef, effort: string | null) => StructuredDeps
  writeResults: (fileName: string, results: EvalResults) => Promise<void>
  writeRecording: (set: string, recording: Recording) => Promise<void>
  /** Writes the `RewindEvalRun` row, or warns and skips it with no database. */
  saveRun: (row: { model: string; promptVersion: string; fixtures: string[]; results: EvalResults; costUsd: number }) => Promise<void>
}

const usd = (n: number) => formatMoney(n, "prose", { locale: "en-US" })
const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`)

/** The value at the given percentile (nearest rank); 0 for no values. */
function percentile(values: readonly number[], p: number): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil((p / 100) * sorted.length) - 1))]
}

function pickFixtures(all: readonly Fixture[], names: readonly string[] | undefined): Fixture[] {
  if (!names || names.length === 0) return [...all]
  const unknown = names.filter((n) => !all.some((f) => f.id === n))
  if (unknown.length > 0) throw new Error(`Unknown fixtures: ${unknown.join(", ")}`)
  return all.filter((f) => names.includes(f.id))
}

function replayModel(set: string, fixtures: readonly Fixture[]): { ref: ModelRef; label: string } {
  const recorded = fixtures.map((f) => readRecording(set, f.id).model).find(Boolean)
  return recorded ? { ref: parseModelRef(recorded), label: recorded } : { ref: REPLAY_DEFAULT, label: `replay:${set}` }
}

/** Runs the eval; returns null when the confirmation is declined. */
export async function runEval(options: EvalOptions, allFixtures: readonly Fixture[], io: EvalIO): Promise<EvalResults | null> {
  if (!options.model && !options.replay) throw new Error("Pass --model=<provider>:<id>, or --replay=<recording set>")
  if (options.replay && options.record) throw new Error("--record writes a live run's answers; a replay has nothing new to record")
  const fixtures = pickFixtures(allFixtures, options.fixtures)
  const { ref, label } = options.replay ? replayModel(options.replay, fixtures) : { ref: parseModelRef(options.model!), label: options.model! }
  const info = lookupModel(ref.provider, ref.id)
  if (!options.replay && !info.pricing && !options.allowUnpriced) {
    throw new Error(`${formatModelRef(ref)} has no price in lib/llm/models.ts, so its cost cannot be estimated; pass --allow-unpriced to run it anyway`)
  }
  const judgeRef = options.judge ? parseModelRef(options.judge) : null
  // A hand-written set has no generator family to differ from
  if (judgeRef && !(options.replay && label.startsWith("replay:"))) assertCrossFamily(ref, judgeRef)

  const calling = fixtures.filter((f) => f.expected.edition === "full")
  const perFixture = options.replay || !info.pricing
    ? 0
    : costUsd(info, { inputTokens: ESTIMATE_TOKENS.input, cachedInputTokens: 0, outputTokens: ESTIMATE_TOKENS.output, reasoningTokens: 0 })
  const generationEstimate = perFixture * calling.length
  const judgeEstimate = judgeRef ? JUDGE_ESTIMATE_USD * calling.length : 0
  const estimate = generationEstimate + judgeEstimate
  io.log(`Rewind eval: ${label}${options.replay ? ` (replaying recordings/${options.replay})` : ""}, prompt ${PROMPT_VERSION}`)
  io.log(`Fixtures: ${fixtures.length}, of which ${calling.length} call the model`)
  io.log(
    `Estimated cost: ${usd(generationEstimate)} generation (${calling.length} x ${ESTIMATE_TOKENS.input} in / ${ESTIMATE_TOKENS.output} out tokens` +
      `${info.pricing ? "" : ", unpriced"})` +
      (judgeRef ? ` + ${usd(judgeEstimate)} judge (${options.judge}, ${calling.length} x ${usd(JUDGE_ESTIMATE_USD)})` : "") +
      ` = ${usd(estimate)}`
  )
  // Built before the confirmation, so a missing key fails before anyone is asked; nothing is called yet
  const effort = options.effort ?? null
  const generatorDeps = options.replay ? null : io.liveDeps(ref, effort)
  let judgeCost = 0
  const judgeDeps: StructuredDeps | null = judgeRef && { resolve: io.liveDeps(judgeRef, null).resolve, record: async (r) => void (judgeCost += r.cost) }
  const paid = !options.replay || judgeRef !== null
  if (paid && !options.yes && !(await io.confirm("Run it?"))) {
    io.log("Not run.")
    return null
  }

  const startedAt = io.now()
  const runs: Array<{ fixture: Fixture; run: FixtureRun; latencyMs: number; costUsd: number; data: RunTrail & { copySource: FixtureResult["copySource"] } }> = []
  for (const fixture of fixtures) {
    const recording = options.replay ? readRecording(options.replay, fixture.id) : null
    const deps = recording ? replayDeps(recording, ref).deps : generatorDeps!
    const run = await runFixture(fixture, ref, deps)
    if (run.result.status !== "completed") throw new Error(`${fixture.id}: the pipeline skipped the member (${run.result.reason})`)
    const { data, trail } = run.result
    const latencyMs = recording ? recording.calls.slice(0, run.calls.length).reduce((ms, c) => ms + (c.latencyMs ?? 0), 0) : run.wallMs
    runs.push({
      fixture,
      run,
      latencyMs,
      costUsd: recordedCost(run.calls, ref),
      data: { edition: data.edition, pages: data.pages.map((p) => p.type), archetype: data.archetype, facts: data.facts, copy: data.copy, trail: trail.copy, copySource: data.copySource },
    })
    if (options.record) {
      await io.writeRecording(slugFor(label), { fixture: fixture.id, promptVersion: PROMPT_VERSION, model: label, calls: run.calls })
    }
  }

  const report = checkRun(runs.map(({ fixture, data }) => ({ fixture: fixture.id, run: data })))

  const verdicts = new Map<string, JudgeVerdict | null>()
  if (judgeDeps) {
    const rubric = readRubric()
    for (const [i, { fixture, run }] of runs.entries()) {
      const outcome = report.outcomes[i]
      if (!outcome.called || run.result.status !== "completed") continue
      verdicts.set(
        fixture.id,
        await judgeFixture({
          generate: (input) => generateStructured(input, judgeDeps),
          rubric,
          fixture: fixture.id,
          factSheet: run.result.trail.factSheet,
          copy: outcome.texts.map(({ slot, rendered }) => ({ slot, text: rendered })),
          signal: new AbortController().signal,
        })
      )
    }
  }

  const fixtureResults: FixtureResult[] = runs.map(({ fixture, run, latencyMs, costUsd: cost, data }, i) => {
    const outcome = report.outcomes[i]
    return {
      id: fixture.id,
      edition: data.edition,
      archetype: outcome.archetype,
      copySource: data.copySource,
      calls: run.calls.length,
      latencyMs,
      costUsd: cost,
      slots: outcome.slots.length,
      firstPassFailed: outcome.firstPassFailed,
      afterRepairFailed: outcome.afterRepairFailed,
      reason: outcome.reason,
      copy: outcome.texts.map(({ slot, origin, rendered }) => ({ slot, origin, text: rendered })),
      judge: verdicts.get(fixture.id) ?? null,
    }
  })
  const judged = fixtureResults.flatMap((f) => (f.judge ? [f.judge.mean] : []))
  const latencies = fixtureResults.filter((f) => f.calls > 0).map((f) => f.latencyMs)
  const generationUsd = fixtureResults.reduce((n, f) => n + f.costUsd, 0)
  const results = evalResults.parse({
    version: 1,
    model: label,
    source: options.replay ? "replay" : "live",
    recordings: options.replay ?? null,
    judge: options.judge ?? null,
    promptVersion: PROMPT_VERSION,
    effort,
    startedAt: startedAt.toISOString(),
    fixtures: fixtureResults,
    rates: report.rates,
    gates: { passed: report.issues.length === 0, issues: report.issues, archetypes: report.archetypes, maxOverlap: report.maxOverlap },
    judgeMean: judged.length > 0 ? judged.reduce((a, b) => a + b, 0) / judged.length : null,
    cost: { estimateUsd: estimate, generationUsd, judgeUsd: judgeCost, totalUsd: generationUsd + judgeCost },
    latencyMs: { p50: percentile(latencies, 50), p95: percentile(latencies, 95) },
  } satisfies EvalResults)

  await io.writeResults(`${startedAt.toISOString().slice(0, 10)}-${slugFor(label)}.json`, results)
  await io.saveRun({ model: label, promptVersion: PROMPT_VERSION, fixtures: fixtures.map((f) => f.id), results, costUsd: results.cost.totalUsd })

  io.log(`First-pass grounding: ${pct(results.rates.firstPass)}; after repair: ${pct(results.rates.afterRepair)}`)
  io.log(`Gates: ${results.gates.passed ? "passed" : `${results.gates.issues.length} issue(s)`}; max deck overlap ${results.gates.maxOverlap ? results.gates.maxOverlap.value.toFixed(2) : "n/a"}`)
  for (const issue of results.gates.issues) io.log(`  - ${issue.fixture ?? "all"} ${issue.check}${issue.slot ? ` ${issue.slot}` : ""}: ${issue.message}`)
  if (judgeRef) io.log(`Judge (advisory): ${results.judgeMean === null ? "no usable scores" : results.judgeMean.toFixed(2)} of 5`)
  io.log(`Cost: ${usd(results.cost.totalUsd)}; latency p50 ${(results.latencyMs.p50 / 1000).toFixed(1)} s, p95 ${(results.latencyMs.p95 / 1000).toFixed(1)} s`)
  return results
}
