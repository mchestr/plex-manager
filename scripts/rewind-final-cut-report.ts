#!/usr/bin/env tsx
/**
 * Measure a final cut that ran, read-only (P8.10 and P9.2 on staging, P9.3 in production).
 *
 * Usage (from a checkout; the runtime image has no scripts/ and no tsx):
 *   DATABASE_URL=... npm run rewind:final-cut-report -- --year=2026
 *   DATABASE_URL=... npm run rewind:final-cut-report -- --year=2026 --since=2026-12-11T18:00:00Z --log=worker.log --warn=20
 *
 * It reads the year's `kind: 'final-cut'` generations (created at or after
 * `--since`, when given) and prints what `final-cut-dry-run.md` records:
 * the re-call rate (completed generations with `llmCalls > 0`, overall and
 * for full editions; pass mark under 30%, a warning above `--warn`, 20% by
 * default), the re-call reasons (`planFinalCut()` of the season issue kept in
 * `previousData` against the stored result), the cost per member, the
 * timings, failures by code and skips by reason. With `--log`, a worker log
 * written at `LOG_LEVEL=debug`, it also counts Tautulli's 429 responses
 * (logged at debug level). It never prints a title or a name, writes nothing,
 * and exits 1 when a generation failed or the re-call rate reaches 30%.
 */

import "dotenv/config"

import { readFileSync } from "node:fs"
import { parseArgs } from "node:util"

import { prisma } from "@/lib/prisma"
import { formatMoney } from "@/lib/utils/format"
import { yearSchema } from "@/lib/validations/shared-schemas"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { describeTally, planFinalCut, storedIssueOf, tallyFinalCut, type FinalCutPlan } from "@/lib/wrapped/pipeline/final-cut"

const USAGE = "Usage: npm run rewind:final-cut-report -- --year=<year> [--since=<ISO time>] [--log=<file>] [--warn=<percent>]"
const PASS_MARK = 0.3

export interface ReportArgs {
  year: number
  since: Date | null
  log: string | null
  warn: number
}

export type ParsedReportArgs = { ok: true; args: ReportArgs } | { ok: false; help: boolean; error?: string }

/** `--year` is required; `--warn` is a percentage under the 30% pass mark. */
export function parseReportArgs(argv: readonly string[]): ParsedReportArgs {
  let values
  try {
    values = parseArgs({
      args: [...argv],
      options: {
        year: { type: "string" },
        since: { type: "string" },
        log: { type: "string" },
        warn: { type: "string", default: "20" },
        help: { type: "boolean", short: "h", default: false },
      },
      strict: true,
    }).values
  } catch (error) {
    return { ok: false, help: false, error: error instanceof Error ? error.message : String(error) }
  }
  if (values.help) return { ok: false, help: true }
  const year = yearSchema.safeParse(Number(values.year))
  if (!year.success) return { ok: false, help: false, error: "--year must be a year, such as --year=2026." }
  const since = values.since === undefined ? null : new Date(values.since)
  if (since && Number.isNaN(since.getTime())) return { ok: false, help: false, error: "--since must be an ISO time, such as 2026-12-11T18:00:00Z." }
  const warn = Number(values.warn)
  if (!Number.isFinite(warn) || warn <= 0 || warn >= PASS_MARK * 100) return { ok: false, help: false, error: "--warn must be a percentage under 30, such as --warn=20." }
  return { ok: true, args: { year: year.data, since, log: values.log ?? null, warn: warn / 100 } }
}

/** One final-cut generation, as the report reads it. */
export interface GenerationRow {
  status: string
  code: string | null
  llmCalls: number
  costUsd: number
  createdAt: Date
  startedAt: Date | null
  finishedAt: Date | null
  /** The stored result's edition, for a completed generation. */
  edition: string | null
  /** The slot plan of the season issue against the result, when both parse as v3. */
  plan: FinalCutPlan | null
}

const percent = (n: number, of: number) => (of === 0 ? "0.0%" : `${((n / of) * 100).toFixed(1)}%`)
const minutes = (ms: number) => `${(ms / 60_000).toFixed(1)} min`
const seconds = (ms: number) => `${(ms / 1000).toFixed(1)} s`
const countBy = (keys: readonly string[]) => keys.reduce<Record<string, number>>((acc, k) => ({ ...acc, [k]: (acc[k] ?? 0) + 1 }), {})
const listCounts = (counts: Record<string, number>) =>
  Object.keys(counts)
    .sort()
    .map((k) => `${k} ${counts[k]}`)
    .join(", ")

/** The value at quantile `q` of sorted numbers (nearest rank). */
function quantile(sorted: readonly number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))] ?? 0
}

/** The report's lines and whether it passes; see the module comment. */
export function formatReport(rows: readonly GenerationRow[], args: Pick<ReportArgs, "year" | "warn">, tautulli429s: number | null): { lines: string[]; pass: boolean } {
  const completed = rows.filter((r) => r.status === "completed")
  const failed = rows.filter((r) => r.status === "failed")
  const skipped = rows.filter((r) => r.status === "skipped")
  const pending = rows.length - completed.length - failed.length - skipped.length
  const recall = completed.filter((r) => r.llmCalls > 0).length
  const full = completed.filter((r) => r.edition === "full")
  const fullRecall = full.filter((r) => r.llmCalls > 0).length
  const rate = completed.length === 0 ? 0 : recall / completed.length
  const cost = completed.reduce((sum, r) => sum + r.costUsd, 0)
  const durations = completed
    .flatMap((r) => (r.startedAt && r.finishedAt ? [r.finishedAt.getTime() - r.startedAt.getTime()] : []))
    .sort((a, b) => a - b)
  const first = Math.min(...rows.map((r) => r.createdAt.getTime()))
  const last = Math.max(...completed.flatMap((r) => (r.finishedAt ? [r.finishedAt.getTime()] : [])))
  const verdict = rate >= PASS_MARK ? "FAIL, at or above the 30% pass mark" : rate > args.warn ? `pass, but above the ${Math.round(args.warn * 100)}% warning` : "pass"
  const planned = completed.flatMap((r) => (r.plan ? [{ plan: r.plan }] : []))

  const lines = [
    `Final cut ${args.year}: ${rows.length} generations, ${completed.length} completed, ${failed.length} failed, ${skipped.length} skipped, ${pending} queued or running.`,
    `Re-call rate: ${recall} of ${completed.length} (${percent(recall, completed.length)}), ${verdict}.`,
    `Full editions: ${fullRecall} of ${full.length} re-call (${percent(fullRecall, full.length)}).`,
    `Slot plan: ${describeTally(tallyFinalCut(planned))}.`,
    ...Object.entries(tallyFinalCut(planned).reasons)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, slots]) => `  ${reason}: ${slots} slot${slots === 1 ? "" : "s"}`),
    `Cost: ${formatMoney(cost, "table", { locale: "en-US" })} in all, ${formatMoney(completed.length === 0 ? 0 : cost / completed.length, "table", { locale: "en-US" })} per completed member.`,
    durations.length === 0
      ? "Timings: no completed generation."
      : `Timings: ${minutes(last - first)} from the first enqueue to the last completion; per member median ${seconds(quantile(durations, 0.5))}, p95 ${seconds(quantile(durations, 0.95))}.`,
    tautulli429s === null ? "Tautulli 429s: not counted (pass --log with a LOG_LEVEL=debug worker log)." : `Tautulli 429s: ${tautulli429s}.`,
  ]
  if (failed.length > 0) lines.push(`Failed: ${listCounts(countBy(failed.map((r) => r.code ?? "UNKNOWN")))}.`)
  if (skipped.length > 0) lines.push(`Skipped: ${listCounts(countBy(skipped.map((r) => r.code ?? "UNKNOWN")))}.`)
  return { lines, pass: failed.length === 0 && rate < PASS_MARK }
}

/** Tautulli's 429 responses in a JSON-lines worker log (`serviceFetch` logs them at debug level). */
export function countTautulli429s(log: string): number {
  let count = 0
  for (const line of log.split("\n")) {
    const start = line.indexOf("{")
    if (start < 0) continue
    try {
      const entry = JSON.parse(line.slice(start)) as { message?: unknown; metadata?: { service?: unknown; status?: unknown } }
      if (entry.metadata?.service === "Tautulli" && entry.metadata.status === 429) count++
    } catch {
      // Not a JSON log line (a docker prefix without JSON, a stack trace).
    }
  }
  return count
}

/** The slot plan of one completed generation: its kept season issue against its result. */
export function planOf(previousData: string | null, data: string): { edition: string | null; plan: FinalCutPlan | null } {
  const next = parseStoredRewind(data)
  if (next.version !== 3) return { edition: null, plan: null }
  const previous = previousData === null ? null : parseStoredRewind(previousData)
  const stored = previous?.version === 3 ? storedIssueOf(previous.data) : { edition: "postcard" as const, pages: [], facts: {}, hasCopy: false, slotHashes: {} }
  const plan = planFinalCut(stored, { edition: next.data.edition, selected: next.data.pages.map((p) => p.type), facts: next.data.facts })
  return { edition: next.data.edition, plan }
}

async function loadGenerations(year: number, since: Date | null): Promise<GenerationRow[]> {
  const rows = await prisma.rewindGeneration.findMany({
    where: { year, kind: "final-cut", ...(since ? { createdAt: { gte: since } } : {}) },
    select: {
      status: true,
      error: true,
      llmCalls: true,
      costUsd: true,
      createdAt: true,
      startedAt: true,
      finishedAt: true,
      previousData: true,
      wrapped: { select: { data: true } },
    },
  })
  return rows.map((row) => {
    const error = row.error as { code?: unknown } | null
    const { edition, plan } = row.status === "completed" ? planOf(row.previousData, row.wrapped.data) : { edition: null, plan: null }
    return {
      status: row.status,
      code: typeof error?.code === "string" ? error.code : null,
      llmCalls: row.llmCalls,
      costUsd: row.costUsd === null ? 0 : Number(row.costUsd),
      createdAt: row.createdAt,
      startedAt: row.startedAt,
      finishedAt: row.finishedAt,
      edition,
      plan,
    }
  })
}

export interface ReportDeps {
  loadGenerations: (year: number, since: Date | null) => Promise<GenerationRow[]>
  readLog: (path: string) => string
  print?: (line: string) => void
}

/** Runs the report; returns the exit code (0 pass, 1 failures or over the pass mark, 2 bad arguments). */
export async function main(argv: readonly string[], deps: ReportDeps): Promise<number> {
  const print = deps.print ?? console.log
  const parsed = parseReportArgs(argv)
  if (!parsed.ok) {
    if (parsed.error) print(parsed.error)
    print(USAGE)
    return parsed.help ? 0 : 2
  }
  const { args } = parsed
  const rows = await deps.loadGenerations(args.year, args.since)
  if (rows.length === 0) {
    print(`No final-cut generations for ${args.year}${args.since ? ` since ${args.since.toISOString()}` : ""}.`)
    return 1
  }
  const report = formatReport(rows, args, args.log === null ? null : countTautulli429s(deps.readLog(args.log)))
  report.lines.forEach((line) => print(line))
  return report.pass ? 0 : 1
}

if (require.main === module) {
  main(process.argv.slice(2), { loadGenerations, readLog: (path) => readFileSync(path, "utf8") })
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error("The final-cut report failed:", error)
      process.exitCode = 1
    })
    .finally(() => prisma.$disconnect())
}
