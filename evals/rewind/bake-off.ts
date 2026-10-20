/**
 * `npm run eval:rewind:select`: the bake-off table (P5.13). Reads every
 * results file in `evals/rewind/results/`, keeps each model's latest full
 * sweep, applies `selectModel` and prints the Markdown table and decision for
 * `model-selection.md`. Offline: it reads files only.
 */

import { existsSync, readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { budgetModelFor } from "@/lib/llm/models"
import { formatMoney } from "@/lib/utils/format"

import { parseModelRef } from "./model-ref"
import { evalResults, type EvalResults } from "./results-schema"
import { selectModel, type Candidate } from "./select-model"

const DIR = path.join(process.cwd(), "evals", "rewind", "results")

/** Each model's latest results that cover the most fixtures; hand replays are not candidates. */
function latestByModel(all: readonly EvalResults[]): EvalResults[] {
  const best = new Map<string, EvalResults>()
  for (const r of all) {
    if (r.model.startsWith("replay:")) continue
    const held = best.get(r.model)
    if (!held || r.fixtures.length > held.fixtures.length || (r.fixtures.length === held.fixtures.length && r.startedAt > held.startedAt)) {
      best.set(r.model, r)
    }
  }
  return [...best.values()]
}

/** A results file as a selection candidate. */
function candidateOf(r: EvalResults): Candidate {
  return {
    model: r.model,
    local: parseModelRef(r.model).provider === "openai-compatible",
    gatesPassed: r.gates.passed,
    firstPass: r.rates.firstPass ?? 0,
    afterRepair: r.rates.afterRepair ?? 0,
    judge: r.judgeMean,
    costUsd: r.cost.generationUsd,
    p95LatencyMs: r.latencyMs.p95,
  }
}

function main() {
  const files = existsSync(DIR) ? readdirSync(DIR).filter((f) => f.endsWith(".json")) : []
  const results = latestByModel(files.map((f) => evalResults.parse(JSON.parse(readFileSync(path.join(DIR, f), "utf8")))))
  if (results.length === 0) {
    console.log("No model results in evals/rewind/results/ yet: run npm run eval:rewind -- --model=<provider>:<id> first.")
    return
  }
  const pct = (n: number | null) => (n === null ? "n/a" : `${(n * 100).toFixed(1)}%`)
  console.log("| Model | Fixtures | First-pass | After repair | Gates | Judge | Cost | p95 |")
  console.log("|---|---|---|---|---|---|---|---|")
  for (const r of results) {
    console.log(
      `| ${r.model} | ${r.fixtures.length} | ${pct(r.rates.firstPass)} | ${pct(r.rates.afterRepair)} | ${r.gates.passed ? "pass" : `${r.gates.issues.length} issues`} | ` +
        `${r.judgeMean === null ? "n/a" : r.judgeMean.toFixed(2)} | ${formatMoney(r.cost.generationUsd, "table", { locale: "en-US" })} | ${(r.latencyMs.p95 / 1000).toFixed(1)} s |`
    )
  }
  const selection = selectModel(results.map(candidateOf))
  console.log("")
  console.log(`Selected default: ${selection.selected ?? "none clears the gates"}`)
  if (selection.selected) console.log(`Economy (repair) model: ${budgetModelFor(parseModelRef(selection.selected).provider) ?? "the default itself"}`)
  for (const r of selection.rejected) console.log(`Rejected ${r.model}: ${r.reasons.join("; ")}`)
  if (selection.localPresets.length > 0) console.log(`Local presets: ${selection.localPresets.join(", ")}`)
}

main()
