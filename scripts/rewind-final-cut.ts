#!/usr/bin/env tsx
/**
 * Plan, rehearse or start the final cut (P8.5; P8.10 and P9.2 run it on staging).
 *
 * Usage (from a checkout; the runtime image has no scripts/ and no tsx):
 *   DATABASE_URL=... npm run rewind:final-cut -- --year=2026                     # plan: no writes, no model calls
 *   DATABASE_URL=... npm run rewind:final-cut -- --year=2026 --through=2026-12-10 --with-llm
 *   REWIND_STAGING=1 DATABASE_URL=... REDIS_URL=... npm run rewind:final-cut -- --year=2026 --through=2026-12-10 --with-llm --apply
 *
 * The plan runs every eligible member through the production pipeline in
 * dry-run mode with the full-year window (`window.finalCut: true`) and data
 * through `--through` (default 31 December), keeping each stored slot that
 * `planFinalCut()` keeps. Without `--with-llm` it calls no model: the
 * changed slots get templates, and the cost is estimated from the price
 * table. Every result is checked with the validator's row checks. It prints
 * the re-call share, the reasons and the cost, never a title or a name.
 *
 * `--apply` (with `--with-llm`, since the job calls the model) enqueues
 * `REWIND_FINAL_CUT` itself. With a `--through` before 31 December it
 * refuses unless `REWIND_STAGING=1`, which only staging sets; with
 * 31 December it refuses before 00:30 on 1 January in the westernmost zone.
 */

import "dotenv/config"

import { parseArgs } from "node:util"

import { prisma } from "@/lib/prisma"
import { estimateDryRun } from "@/lib/rewind/dry-run/estimate"
import { enqueueFinalCut, finalCutOpensAt, seasonZones } from "@/lib/rewind/season-runs"
import { finalCutRefusal, isRewindStaging } from "@/lib/queue/jobs/rewind-final-cut"
import { formatMoney } from "@/lib/utils/format"
import { yearSchema } from "@/lib/validations/shared-schemas"
import { throughFor } from "@/lib/wrapped/aggregate/window"
import { parseStoredRewind } from "@/lib/wrapped/data/parse-stored"
import { validateStoredRow, type ValidationCode } from "@/lib/wrapped/maintenance/validate-year"
import { describeTally, planFinalCut, storedIssueOf, tallyFinalCut, type FinalCutPlan, type StoredIssue } from "@/lib/wrapped/pipeline/final-cut"
import { generateUserRewind, type GenerateUserResult } from "@/lib/wrapped/pipeline/generate-user"

const USAGE = "Usage: npm run rewind:final-cut -- --year=<year> [--through=YYYY-MM-DD] [--with-llm] [--apply]"
const MEMBER_LIMIT_MS = 300_000

export interface FinalCutArgs {
  year: number
  through: string
  withLlm: boolean
  apply: boolean
}

export type ParsedArgs = { ok: true; args: FinalCutArgs } | { ok: false; help: boolean; error?: string }

/** `--year` is required; `--through` is a day of that year's December, 31 December by default. */
export function parseFinalCutArgs(argv: readonly string[]): ParsedArgs {
  let values
  try {
    values = parseArgs({
      args: [...argv],
      options: {
        year: { type: "string" },
        through: { type: "string" },
        "with-llm": { type: "boolean", default: false },
        apply: { type: "boolean", default: false },
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
  const through = values.through ?? throughFor(year.data, { finalCut: true })
  if (!new RegExp(`^${year.data}-12-(0[1-9]|[12]\\d|3[01])$`).test(through)) {
    return { ok: false, help: false, error: `--through must be a day in December ${year.data}, such as ${year.data}-12-10.` }
  }
  if (values.apply && !values["with-llm"]) return { ok: false, help: false, error: "--apply needs --with-llm: the final cut calls the model for the changed slots." }
  return { ok: true, args: { year: year.data, through, withLlm: values["with-llm"], apply: values.apply } }
}

/** One member the plan runs: their id and stored season issue, when it parses as v3. */
export interface PlanMember {
  userId: string
  season: StoredIssue | null
}

export interface MemberOutcome {
  plan: FinalCutPlan
  codes: ValidationCode[]
  costUsd: number
}

/** The plan of one member from their stored season issue and the dry run's result. */
export function outcomeOf(member: PlanMember, result: Extract<GenerateUserResult, { status: "completed" }>): MemberOutcome {
  const stored: StoredIssue = member.season ?? { edition: "postcard", pages: [], facts: {}, hasCopy: false, slotHashes: {} }
  const { data } = result
  const plan = planFinalCut(stored, { edition: data.edition, selected: data.pages.map((p) => p.type), facts: data.facts })
  const codes = validateStoredRow(
    { id: member.userId, userId: member.userId, status: "completed", data: JSON.stringify(data), finalCutAt: new Date() },
    { year: data.year, finalCut: true }
  )
  return { plan, codes, costUsd: result.trail.copy.costUsd }
}

export interface FinalCutDeps {
  loadMembers: (year: number) => Promise<PlanMember[]>
  dryRun: (member: PlanMember, args: FinalCutArgs) => Promise<GenerateUserResult>
  /** The price-table estimate of one copy call. */
  estimateCall: () => Promise<number>
  enqueue: (args: FinalCutArgs) => Promise<{ jobId: string; alreadyQueued: boolean }>
  opensAt: (year: number) => Promise<Date>
  staging: () => boolean
  now?: () => number
  print?: (line: string) => void
}

/** The printed summary of a plan. */
export function formatPlan(outcomes: readonly MemberOutcome[], skipped: Record<string, number>, costUsd: number, measured: boolean): string[] {
  const tally = tallyFinalCut(outcomes)
  const share = tally.members === 0 ? 0 : tally.recall / tally.members
  const failures: Record<string, number> = {}
  for (const outcome of outcomes) for (const code of outcome.codes) failures[code] = (failures[code] ?? 0) + 1
  const lines = [
    describeTally(tally),
    `Re-call share: ${(share * 100).toFixed(1)}% (pass mark under 30%).`,
    ...Object.entries(tally.reasons)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([reason, slots]) => `  ${reason}: ${slots} slot${slots === 1 ? "" : "s"}`),
    `${measured ? "Model cost" : "Estimated model cost"}: ${formatMoney(costUsd, "table", { locale: "en-US" })}.`,
    Object.keys(failures).length === 0
      ? "Validator: zero failures."
      : `Validator: ${Object.entries(failures).map(([code, n]) => `${code} ${n}`).join(", ")}.`,
  ]
  const reasons = Object.keys(skipped).sort()
  if (reasons.length > 0) lines.push(`Skipped: ${reasons.map((r) => `${r} ${skipped[r]}`).join(", ")}.`)
  return lines
}

/** Runs the script; returns the exit code (0 done, 1 refused or failures, 2 bad arguments). */
export async function main(argv: readonly string[], deps: FinalCutDeps): Promise<number> {
  const print = deps.print ?? console.log
  const parsed = parseFinalCutArgs(argv)
  if (!parsed.ok) {
    if (parsed.error) print(parsed.error)
    print(USAGE)
    return parsed.help ? 0 : 2
  }
  const { args } = parsed

  if (args.apply) {
    const refusal = finalCutRefusal(args, { now: (deps.now ?? Date.now)(), opensAt: await deps.opensAt(args.year), staging: deps.staging() })
    if (refusal === "EARLY_THROUGH") {
      print(`Refusing: --through=${args.through} is before 31 December, which only staging may rehearse (REWIND_STAGING=1).`)
      return 1
    }
    if (refusal === "NOT_YET") {
      print(`Refusing: the final cut of ${args.year} opens at ${(await deps.opensAt(args.year)).toISOString()}.`)
      return 1
    }
    const run = await deps.enqueue(args)
    print(run.alreadyQueued ? `The final cut is already queued (job ${run.jobId}).` : `Enqueued REWIND_FINAL_CUT (job ${run.jobId}) for ${args.year}, data through ${args.through}.`)
    return 0
  }

  print(`Final cut plan for ${args.year}, data through ${args.through}${args.withLlm ? ", calling the model" : ", no model calls"}. Nothing is written.`)
  const outcomes: MemberOutcome[] = []
  const skipped: Record<string, number> = {}
  for (const member of await deps.loadMembers(args.year)) {
    const result = await deps.dryRun(member, args)
    if (result.status === "skipped") skipped[result.reason] = (skipped[result.reason] ?? 0) + 1
    else outcomes.push(outcomeOf(member, result))
  }
  const measured = args.withLlm
  const recall = outcomes.filter((o) => o.plan.regenerate.length > 0).length
  const cost = measured ? outcomes.reduce((sum, o) => sum + o.costUsd, 0) : recall * (await deps.estimateCall())
  formatPlan(outcomes, skipped, cost, measured).forEach((line) => print(line))
  return outcomes.some((o) => o.codes.length > 0) ? 1 : 0
}

/**
 * One member through the production pipeline in dry-run mode, with the
 * full-year window and data through `--through`; without `--with-llm` the
 * changed slots get templates.
 */
export function dryRunMember(member: PlanMember, args: FinalCutArgs): Promise<GenerateUserResult> {
  return generateUserRewind({
    userId: member.userId,
    year: args.year,
    kind: "final-cut",
    through: args.through,
    finalCut: true,
    mode: "dry-run",
    copyPolicy: args.withLlm ? "changed-slots" : "no-llm",
    signal: AbortSignal.timeout(MEMBER_LIMIT_MS),
    audience: "all",
  })
}

/** Every eligible member, with their stored season issue when there is one. */
async function loadPlanMembers(year: number): Promise<PlanMember[]> {
  const users = await prisma.user.findMany({
    where: { disabledAt: null, plexUserId: { not: null } },
    select: { id: true, plexWrapped: { where: { year, status: "completed" }, select: { data: true } } },
  })
  return users.map((user) => {
    const stored = parseStoredRewind(user.plexWrapped[0]?.data ?? null)
    return { userId: user.id, season: stored.version === 3 ? storedIssueOf(stored.data) : null }
  })
}

if (require.main === module) {
  const deps: FinalCutDeps = {
    loadMembers: loadPlanMembers,
    dryRun: dryRunMember,
    estimateCall: async () => {
      const estimate = await estimateDryRun({ copyPolicy: "default" })
      return estimate.costUsd
    },
    enqueue: (args) => enqueueFinalCut({ year: args.year, through: args.through, triggeredBy: "script" }),
    opensAt: async (year) => finalCutOpensAt(year, await seasonZones()),
    staging: isRewindStaging,
  }
  main(process.argv.slice(2), deps)
    .then((code) => {
      process.exitCode = code
    })
    .catch((error: unknown) => {
      console.error("The final cut script failed:", error)
      process.exitCode = 1
    })
    // The queue's Redis connection would keep the process alive.
    .finally(() => prisma.$disconnect().finally(() => process.exit()))
}
