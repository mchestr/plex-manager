/**
 * The admin eval results (P11.30): `RewindEvalRun` rows merged with the
 * committed `evals/rewind/results/*.json`, each validated with P5.13's
 * `evalResults`, and the model `evals/rewind/selected.json` names.
 *
 * ```
 * RewindEvalRun.results ─┐
 *                        ├─ evalResults.safeParse ─► key model@startedAt ─► one run
 * results/<file>.json  ──┘        (invalid: skipped, logged, listed)
 * ```
 *
 * A run written by `npm run eval:rewind` with a database is both a row and a
 * file; the two share `model` and `startedAt`, so they merge into one run.
 *
 * @module lib/admin/eval-results
 */

import "server-only"

import { readdirSync, readFileSync } from "node:fs"
import path from "node:path"

import { z } from "zod"

import { evalResults, type EvalResults, type JudgeScores } from "@/evals/rewind/results-schema"
import { prisma } from "@/lib/prisma"
import type { TableSort } from "@/lib/ui/table-params"
import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("admin-evals")

export interface EvalRun {
  /** The database row's id, else the results file's name without `.json`. */
  id: string
  origin: "database" | "file" | "both"
  fileName: string | null
  /** The model and prompt version `selected.json` names. */
  selected: boolean
  /** The judged fixtures' mean score per rubric dimension; null when unjudged. */
  judgeScores: JudgeScores | null
  results: EvalResults
}

export interface EvalRunsResult {
  runs: EvalRun[]
  /** Results files and database rows that failed validation. */
  skipped: string[]
  selected: { model: string | null; promptVersion: string | null }
}

export const EVAL_SORTS = ["started", "model", "firstPass", "cost", "p95"] as const
export const EVAL_DEFAULT_SORT: TableSort = { id: "started", desc: true }

const selectedSchema = z.object({ model: z.string().nullable(), promptVersion: z.string().nullable().catch(null) })

const evalsDir = () => path.join(process.cwd(), "evals", "rewind")

function readSelected(): EvalRunsResult["selected"] {
  try {
    return selectedSchema.parse(JSON.parse(readFileSync(path.join(evalsDir(), "selected.json"), "utf8")))
  } catch {
    return { model: null, promptVersion: null }
  }
}

function parseFile(fileName: string): EvalResults | null {
  try {
    const parsed = evalResults.safeParse(JSON.parse(readFileSync(path.join(evalsDir(), "results", fileName), "utf8")))
    return parsed.success ? parsed.data : null
  } catch {
    return null
  }
}

function readFiles(skipped: string[]): Array<{ fileName: string; results: EvalResults }> {
  let names: string[]
  try {
    names = readdirSync(path.join(evalsDir(), "results")).filter((name) => name.endsWith(".json")).sort()
  } catch {
    return []
  }
  const files: Array<{ fileName: string; results: EvalResults }> = []
  for (const fileName of names) {
    const results = parseFile(fileName)
    if (results) files.push({ fileName, results })
    else {
      logger.warn("Skipped an invalid eval results file", { fileName })
      skipped.push(fileName)
    }
  }
  return files
}

const keyOf = (r: EvalResults) => `${r.model}@${r.startedAt}`

/** The judged fixtures' mean per dimension. */
function meanScores(results: EvalResults): JudgeScores | null {
  const judged = results.fixtures.flatMap((f) => (f.judge ? [f.judge.scores] : []))
  if (judged.length === 0) return null
  const mean = (dim: keyof JudgeScores) => judged.reduce((sum, s) => sum + s[dim], 0) / judged.length
  return { voice: mean("voice"), specificity: mean("specificity"), warmth: mean("warmth"), restraint: mean("restraint"), faithfulness: mean("faithfulness") }
}

/** Every valid run, database and committed files merged; see the module comment. */
export async function loadEvalRuns(): Promise<EvalRunsResult> {
  const skipped: string[] = []
  const selected = readSelected()
  const rows = await prisma.rewindEvalRun.findMany({ orderBy: { createdAt: "desc" }, take: 500, select: { id: true, results: true } })

  const byKey = new Map<string, Omit<EvalRun, "selected" | "judgeScores">>()
  for (const row of rows) {
    const parsed = evalResults.safeParse(row.results)
    if (!parsed.success) {
      logger.warn("Skipped an invalid RewindEvalRun row", { id: row.id, issues: parsed.error.issues.length })
      skipped.push(`RewindEvalRun ${row.id}`)
      continue
    }
    byKey.set(keyOf(parsed.data), { id: row.id, origin: "database", fileName: null, results: parsed.data })
  }
  for (const { fileName, results } of readFiles(skipped)) {
    const held = byKey.get(keyOf(results))
    if (held) byKey.set(keyOf(results), { ...held, origin: "both", fileName })
    else byKey.set(keyOf(results), { id: fileName.replace(/\.json$/, ""), origin: "file", fileName, results })
  }

  const runs = [...byKey.values()].map((run) => ({
    ...run,
    selected: selected.model !== null && run.results.model === selected.model && (selected.promptVersion === null || run.results.promptVersion === selected.promptVersion),
    judgeScores: meanScores(run.results),
  }))
  return { runs, skipped, selected }
}

const nullsLast = (a: number | null, b: number | null) => (a === null ? (b === null ? 0 : 1) : b === null ? -1 : a - b)

const COMPARE: Record<(typeof EVAL_SORTS)[number], (a: EvalRun, b: EvalRun) => number> = {
  started: (a, b) => a.results.startedAt.localeCompare(b.results.startedAt),
  model: (a, b) => a.results.model.localeCompare(b.results.model, "en"),
  firstPass: (a, b) => nullsLast(a.results.rates.firstPass, b.results.rates.firstPass),
  cost: (a, b) => a.results.cost.totalUsd - b.results.cost.totalUsd,
  p95: (a, b) => a.results.latencyMs.p95 - b.results.latencyMs.p95,
}

/** A sorted copy; an unknown sort id falls back to the newest first. */
export function sortEvalRuns(runs: readonly EvalRun[], sort: TableSort): EvalRun[] {
  const known = sort.id in COMPARE
  const compare = known ? COMPARE[sort.id as keyof typeof COMPARE] : COMPARE.started
  const direction = known && !sort.desc ? 1 : -1
  return [...runs].sort((a, b) => direction * compare(a, b) || a.id.localeCompare(b.id))
}
