/**
 * Running a problem report's fix (docs/problem-reports.md, "Fixes").
 *
 * ```
 * startFix ── the report is open and no fix is running ─► FIXING, runToken + 1, FIX_STARTED
 *   └─ queues PROBLEM_REPORT_FIX { reportId, runToken, step: "start" }   (no queue ─► With the server admin)
 * runFixStep, in the job
 *   ├─ another run's token, or the report isn't FIXING ─► stops
 *   ├─ problem reports switched off ─► With the server admin (OFF)
 *   └─ the fix's step (steps/*) ─► wait again (the job delays itself)
 *                                 ─► FIXED, and each member who reported or follows it is told
 *                                 ─► With the server admin, with the reason
 *                                 ─► no better copy: CLOSED for a member's run, and the
 *                                    members are told; an admin's run goes back to them
 * ```
 *
 * Every state change is a conditional `updateMany` on the claimed
 * `runToken` and `FIXING`, so a double tap claims one run and a job
 * delivered twice acts once. Each step that acts gates and records itself in
 * the ledger first (`gateAndRecord`).
 *
 * A worker that stops after a run ends a report (fixed, or closed with no
 * better copy) and before queueing the members' DMs loses them: the job,
 * delivered again, finds the report no longer `FIXING` and stops. A lost DM
 * is only a lost DM (`updates.ts`).
 *
 * @module lib/problem-reports/run
 */

import "server-only"

import type { ProblemReportStatus } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { FIX_ACTIONS, type FixAction, type FixTrigger } from "@/lib/problem-reports/fixes"
import { endLedgerRow } from "@/lib/problem-reports/ledger"
import { getProblemReportSettings } from "@/lib/problem-reports/settings"
import { runBetterCopy } from "@/lib/problem-reports/steps/better-copy"
import { runFixMatch } from "@/lib/problem-reports/steps/fix-match"
import { runLookForMissing } from "@/lib/problem-reports/steps/look-for-missing"
import { runRefresh } from "@/lib/problem-reports/steps/refresh"
import { runRemoveAndSearch } from "@/lib/problem-reports/steps/remove-and-search"
import { runSwap } from "@/lib/problem-reports/steps/swap"
import type { FixedDetails, StepOutcome, StepReport } from "@/lib/problem-reports/steps/types"
import { queueAdminAlertFromWorker, queueMemberUpdates } from "@/lib/problem-reports/updates"
import { isRedisConfigured } from "@/lib/queue/connection"
import { enqueueFromRequest } from "@/lib/queue/request-path"
import { JOB_TYPES, type ProblemReportFixPayload } from "@/lib/queue/types"
import type { ToAdminReason } from "@/lib/validations/problem-reports"

const OPEN_FOR_A_FIX: ProblemReportStatus[] = ["SENT", "WITH_ADMIN"]

const isFixAction = (value: string | null): value is FixAction => FIX_ACTIONS.some((action) => action === value)

/**
 * Claims a run of `action` on an open report that no fix is running, and
 * queues its first step. `NOT_OPEN` for a closed report or one already
 * fixing; `QUEUE_DOWN` when the job can't be queued, and the report is then
 * back with the server admin.
 */
export async function startFix(input: {
  reportId: string
  action: FixAction
  trigger: FixTrigger
  actorUserId: string | null
}): Promise<{ ok: true; runToken: number } | { ok: false; reason: "NOT_OPEN" | "QUEUE_DOWN" }> {
  const { reportId, action, trigger, actorUserId } = input
  const runToken = await prisma.$transaction(async (tx) => {
    const { count } = await tx.problemReport.updateMany({
      where: { id: reportId, activeKey: { not: null }, status: { in: OPEN_FOR_A_FIX } },
      data: { status: "FIXING", action, runToken: { increment: 1 } },
    })
    if (count === 0) return null
    const claimed = await tx.problemReport.findUniqueOrThrow({ where: { id: reportId }, select: { runToken: true } })
    await tx.problemReportEvent.create({ data: { reportId, kind: "FIX_STARTED", actorUserId, data: { action, trigger } } })
    return claimed.runToken
  })
  if (runToken === null) return { ok: false, reason: "NOT_OPEN" }

  const payload: ProblemReportFixPayload = { reportId, runToken, step: "start", trigger, actorUserId }
  const queued = isRedisConfigured() ? await enqueueFromRequest(JOB_TYPES.PROBLEM_REPORT_FIX, payload) : { ok: false as const }
  if (queued.ok) return { ok: true, runToken }
  await handBack({ id: reportId, runToken }, action, "QUEUE_DOWN")
  return { ok: false, reason: "QUEUE_DOWN" }
}

/** The report back with the server admin, with why; only while this run holds it. */
async function handBack(run: { id: string; runToken: number }, action: FixAction, reason: ToAdminReason): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.problemReport.updateMany({ where: { id: run.id, runToken: run.runToken, status: "FIXING" }, data: { status: "WITH_ADMIN" } })
    if (count === 0) return false
    await tx.problemReportEvent.create({ data: { reportId: run.id, kind: "TO_ADMIN", data: { reason, action } } })
    return true
  })
}

/** The report fixed, by this run, with what a replacement did and the title's new rating key when it has one. */
async function markFixed(run: { id: string; runToken: number }, action: FixAction, now: Date, details?: FixedDetails): Promise<boolean> {
  const { ratingKey, ...shown } = details ?? {}
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.problemReport.updateMany({
      where: { id: run.id, runToken: run.runToken, status: "FIXING" },
      data: { status: "FIXED", activeKey: null, resolvedAt: now, ...(ratingKey ? { plexRatingKey: ratingKey } : {}) },
    })
    if (count === 0) return false
    await tx.problemReportEvent.create({ data: { reportId: run.id, kind: "FIXED", data: { reason: "fix", action, ...shown } } })
    return true
  })
}

/** A member's run that found no better copy: closed, since there is nothing for the server admin to do yet. */
async function markNoBetterCopy(run: { id: string; runToken: number }, now: Date): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    const { count } = await tx.problemReport.updateMany({
      where: { id: run.id, runToken: run.runToken, status: "FIXING" },
      data: { status: "CLOSED", activeKey: null, resolvedAt: now },
    })
    if (count === 0) return false
    await tx.problemReportEvent.create({ data: { reportId: run.id, kind: "CLOSED", data: { reason: "no_better_copy" } } })
    return true
  })
}

const STEPS: Record<FixAction, (report: StepReport, data: ProblemReportFixPayload, now: Date) => Promise<StepOutcome>> = {
  SWAP: runSwap,
  BETTER_COPY: runBetterCopy,
  LOOK_FOR_MISSING: runLookForMissing,
  FIX_MATCH: runFixMatch,
  REFRESH: runRefresh,
  REMOVE_AND_SEARCH: runRemoveAndSearch,
}

/** What the job does next: delay itself until `at` with the new payload, or finish. */
export type StepResult = { next: { at: number; data: ProblemReportFixPayload } } | { done: true }

/** Runs the job's current step; see the module comment. */
export async function runFixStep(data: ProblemReportFixPayload, now = new Date()): Promise<StepResult> {
  const row = await prisma.problemReport.findUnique({
    where: { id: data.reportId },
    select: { id: true, status: true, runToken: true, action: true, reporterId: true, plexRatingKey: true, titleKey: true },
  })
  if (!row || row.status !== "FIXING" || row.runToken !== data.runToken || !isFixAction(row.action)) return { done: true }
  const report: StepReport = { ...row, action: row.action }

  const outcome: StepOutcome = (await getProblemReportSettings()).enabled ? await STEPS[report.action](report, data, now) : { toAdmin: "OFF" }
  return finish(report, data, outcome, now)
}

async function finish(report: StepReport, data: ProblemReportFixPayload, outcome: StepOutcome, now: Date): Promise<StepResult> {
  if ("next" in outcome) return { next: { at: outcome.next.at, data: { ...data, ...outcome.next.data } } }
  if ("noBetterCopy" in outcome) {
    // The member who asked can take it to the server admin from their reports; an admin who ran it decides here
    if (data.trigger !== "automatic") return finish(report, data, { toAdmin: "NO_BETTER_COPY" }, now)
    if (await markNoBetterCopy(report, now)) {
      await endLedgerRow(report.id, report.runToken, "NO_BETTER_COPY", now)
      await queueMemberUpdates(report.id, "CLOSED", { from: "worker" })
    }
    return { done: true }
  }
  if ("fixed" in outcome) {
    if (await markFixed(report, report.action, now, outcome.details)) {
      await endLedgerRow(report.id, report.runToken, "FIXED", now)
      await queueMemberUpdates(report.id, "FIXED", { from: "worker" })
    }
    return { done: true }
  }
  if (await handBack(report, report.action, outcome.toAdmin)) {
    await endLedgerRow(report.id, report.runToken, outcome.toAdmin, now)
    // An admin who ran the fix is looking at the report; the others hear of it
    if (data.trigger === "automatic") await queueAdminAlertFromWorker(report.id)
  }
  return { done: true }
}
