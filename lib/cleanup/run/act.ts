/**
 * The act step (TS 8.8 steps 1 to 8, E19, E20, E31, E32): the one caller of
 * the deletion path. It runs inside a live run, after its reconcile, or in a
 * `cleanup:act` job. The caller holds the run claim. Server-only.
 *
 * 1. Off, paused or before `holdUntil`: stop with no change.
 * 2. Recover every `deleting` row (`recoverDeleting`, `clearApproval: false`).
 * 3. Reconcile with `entries: false`, unless the caller already did.
 * 4. Each rule's blocks, with `readFailed` after a failed or busy read
 *    (safety-r2-8), and the `blockBasis` they used: the rule `revision` and
 *    the options hash. The candidates planned for today (TS 8.7), in plan
 *    order.
 * 5. Once: the roots, the tag maps and the new requests (`prepareChecks`).
 *    An Overseerr failure holds every candidate and stops the step.
 * 6. Per candidate, while the signal holds: the stop check on the settings
 *    row (E20), the row read again (skip when gone, changed or no longer a
 *    candidate), the approver check (`stillAdmin`), the unknown size hold,
 *    the rule check (below), the pre-delete re-read, then the delete. An
 *    audit failure stops with `auditFailed`, an arr 401 with `arrRefused`.
 * 7. After one or more deletions, Overseerr's availability sync, once.
 *
 * The rule check (step 6.5, owner-r2-1) lives in `rule-check.ts`. It reads
 * the holding rules and the options for every candidate and never compares
 * with an earlier read.
 *
 * @module lib/cleanup/run/act
 */

import "server-only"

import type { Block, RunOutcome } from "@/lib/cleanup/blocks"
import { isDue, planBudget } from "@/lib/cleanup/engine/budget"
import { groupBatches, readUsedToday } from "@/lib/cleanup/run/batches"
import { deleteItem, exitDeleted } from "@/lib/cleanup/run/delete"
import { exitItem } from "@/lib/cleanup/run/exit"
import { loadActServices, preDelete, prepareChecks, sinceOf, type PreDeleteEnv } from "@/lib/cleanup/run/pre-delete"
import { reconcile, type ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { recoverDeleting } from "@/lib/cleanup/run/recover"
import { auditReleased } from "@/lib/cleanup/run/release"
import { exitStep, NEXT, ruleCheck, type RuleCheckEnv, type Stop, updateRow } from "@/lib/cleanup/run/rule-check"
import { loadReconcileContext, optionsHash } from "@/lib/cleanup/run/run-claim"
import { parseArrRef } from "@/lib/cleanup/schema/runtime"
import { type CleanupSettingsRow, isLive, readCleanupSettingsRow } from "@/lib/cleanup/settings"
import { runOverseerrJob } from "@/lib/connections/overseerr-cleanup"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { createLogger } from "@/lib/utils/logger"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

const logger = createLogger("CLEANUP_ACT")

export interface ActInput { runId: string; trigger: string; actorId: string; signal?: AbortSignal; now?: Date; reconciled: boolean
  readStatus?: "complete" | "failed" | "busy" }
/** Counts and codes only. `seen`: the keys planned for today that this step took (the job's rounds, TS 9.3). */
export interface ActResult { outcome: RunOutcome; blocks: Block[]; deleted: number; deferred: number; held: number; seen: string[] }
interface Env extends RuleCheckEnv { input: ActInput; blocked: Set<string>; pre: Omit<PreDeleteEnv, "options">; result: ActResult }

const featureStop = (s: Pick<CleanupSettingsRow, "enabled">): Stop => ({ stop: "paused", block: { code: s.enabled ? "paused" : "off" } })

/** The admin who queued a job or approved a batch, while they are still an admin (`stillAdmin` of `member-activity.ts`). */
export async function stillAdmin(userId: string | null | undefined): Promise<string | null> {
  if (!userId) return null
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { isAdmin: true } })
  return user?.isAdmin ? userId : null
}

/** Step 4: the delete candidates of `ctx` planned for today, in plan order (TS 8.7). */
async function planToday(ctx: ReconcileContext, blocked: ReadonlySet<string>): Promise<CleanupItem[]> {
  const { today, zone, settings: { holdUntil, options } } = ctx
  const [rows, rules, usedToday] = await Promise.all([prisma.cleanupItem.findMany({ where: { state: { in: ["leaving", "approved", "deleting"] } } }),
    prisma.cleanupRule.findMany({ select: { id: true, mode: true, createdAt: true } }), readUsedToday(today, zone)])
  const { candidates } = groupBatches({ rows, rules: new Map(rules.map((r) => [r.id, r])), today, holdUntil, budget: options.budget, usedToday, blocked })
  const { plan } = planBudget({ budget: options.budget, usedToday, today, holdUntil, candidates: candidates.map((c) => ({ itemKey: c.itemKey,
    level: c.level as Level, titleKey: c.titleKey, leaveOn: c.leaveOn ?? today, sizeBytes: c.sizeBytes })) })
  const byKey = new Map(candidates.map((c) => [c.itemKey, c]))
  return [...plan].flatMap(([key, day]) => (day === today ? (byKey.get(key) ?? []) : []))
}

/** The keys planned for today now: the `cleanup:act` job's check for candidates that its step did not see (TS 9.3). */
export async function candidatesToday(now: Date = new Date()): Promise<string[]> {
  const ctx = await loadReconcileContext({ now })
  return (await planToday(ctx, new Set([...ctx.rules.values()].filter((r) => r.blocks.length > 0).map((r) => r.id)))).map((row) => row.itemKey)
}

/** Step 6 for one candidate. */
async function actItem(planned: CleanupItem, env: Env): Promise<typeof NEXT | Stop> {
  const settings = await readCleanupSettingsRow()
  if (!isLive(settings)) return featureStop(settings)
  const { today, settings: { holdUntil } } = env.ctx
  const row = await prisma.cleanupItem.findUnique({ where: { id: planned.id } })
  const candidate = row && (row.state === "approved" || (row.state === "leaving" && !row.needsApproval && isDue(row.leaveOn, today, holdUntil))) &&
    !row.holdCode && !(row.ruleIds.length > 0 && row.ruleIds.every((id) => env.blocked.has(id)))
  if (!row || !candidate || row.updatedAt.getTime() !== planned.updatedAt.getTime()) return NEXT
  if (row.state === "approved" && !(await stillAdmin(row.approvedBy))) return (await updateRow(row, { state: "leaving", approvedAt: null, approvedBy: null }), NEXT)
  if (row.sizeBytes === 0n) return (await updateRow(row, { holdCode: "noValue:size" }), (env.result.held += 1), NEXT)
  const checked = await ruleCheck(row, settings.options, env)
  if (checked === NEXT || "stop" in checked) return checked
  const { item, row: fresh } = checked
  const arr = parseArrRef(fresh.arr)
  if (!arr) return NEXT
  const show = item.showKey ? (env.ctx.snapshot?.levels.show?.byKey.get(item.showKey) ?? null) : null
  const pre = await preDelete({ row: fresh, arr, item, show }, { ...env.pre, options: settings.options })
  const { runId } = env.input
  if (pre.kind === "defer") return (await updateRow(fresh, { deferredAt: env.now }), (env.result.deferred += 1), NEXT)
  if (pre.kind === "hold") {
    await updateRow(fresh, { holdCode: pre.code })
    env.result.held += 1
    return pre.refused ? { stop: "arrRefused", block: { code: "arrRefused", service: pre.refused } } : NEXT
  }
  if (pre.kind === "rescue") return exitStep(() => exitItem(fresh, { kind: "rescued", reason: pre.reason, detail: pre.detail, runId, actorId: env.input.actorId }))
  if (pre.kind === "gone") {
    return exitStep(async () => {
      if (await exitDeleted(fresh, arr, { runId, alreadyGone: true, match: "updatedAt" })) env.result.deleted += 1
    })
  }
  const done = await deleteItem(fresh, arr, { services: env.pre.services, runId, today, collections: settings.runtime.collections, signal: env.input.signal })
  if (done.kind === "deleted") env.result.deleted += 1
  if (done.kind === "stopped") return featureStop(await readCleanupSettingsRow())
  if (done.kind === "auditFailed") return { stop: "auditFailed", block: { code: "auditFailed" } }
  return done.kind === "failed" && done.refused ? { stop: "arrRefused", block: { code: "arrRefused", service: done.refused } } : NEXT
}

/** The act step (TS 8.8). Throws on a database error. */
export async function actStep(input: ActInput): Promise<ActResult> {
  const now = input.now ?? new Date()
  const result: ActResult = { outcome: "finished", blocks: [], deleted: 0, deferred: 0, held: 0, seen: [] }
  const ctx = await loadReconcileContext({ now, runId: input.runId, actorId: input.actorId })
  if (!isLive(ctx.settings)) return { ...result, outcome: "paused", blocks: [featureStop(ctx.settings).block] }
  if (ctx.settings.holdUntil && ctx.today < ctx.settings.holdUntil) return result
  await prisma.$transaction((tx) => recoverDeleting(tx, { clearApproval: false }))
  if (!input.reconciled) await reconcile({ ctx })
  const failedRead = input.readStatus === "failed" || input.readStatus === "busy"
  if (failedRead) result.blocks.push({ code: "readFailed" })
  const hash = optionsHash(ctx.settings.options)
  const rules = [...ctx.rules.values()]
  const blocks = new Map(rules.map((r) => [r.id, [...r.blocks, ...(failedRead ? [{ code: "readFailed", ruleId: r.id }] : [])]]))
  const blocked = new Set(rules.filter((r) => (blocks.get(r.id) ?? []).length > 0).map((r) => r.id))
  const planned = await planToday(ctx, blocked)
  result.seen = planned.map((row) => row.itemKey)
  if (planned.length === 0) return { ...result, outcome: failedRead ? "blocked" : "finished" }
  const services = await loadActServices()
  const takenAt = Date.parse(ctx.snapshot?.header.facts.takenAt ?? "") || now.getTime()
  const prepared = await prepareChecks(services, { oldestSince: Math.min(...planned.map((row) => sinceOf(row, takenAt))),
    g9: ctx.settings.options.protections.g9.enabled, signal: input.signal })
  if (!prepared) {
    const { count } = await prisma.cleanupItem.updateMany({ where: { id: { in: planned.map((row) => row.id) } }, data: { holdCode: "sourceFailed:overseerr" } })
    return { ...result, outcome: "blocked", held: count, blocks: [...result.blocks, { code: "sourceFailed", service: "overseerr" }] }
  }
  const env: Env = { input, ctx, now, blocks, blocked, basis: new Map(rules.map((r) => [r.id, `${r.revision}:${hash}`])), compiled: new Map(),
    evals: new Map([[hash, ctx.evaluation]]), groups: new Map(), result,
    pre: { services, prepared, users: ctx.snapshot?.header.facts.users ?? {}, takenAt, zone: ctx.zone, now, signal: input.signal } }
  for (const row of planned) {
    const step = input.signal?.aborted ? { stop: "stopped" as const, block: { code: "stopped" } } : await actItem(row, env)
    if (step === NEXT) continue
    result.outcome = step.stop
    result.blocks.push(step.block)
    break
  }
  auditReleased(env.groups.values(), input.actorId)
  if (result.outcome === "finished" && failedRead) result.outcome = "blocked"
  if (result.deleted > 0 && services.overseerr) {
    const sync = await runOverseerrJob(services.overseerr, "availability-sync", { signal: input.signal })
    if (!sync.ok) logger.warn("cleanup.availability_sync_failed", { code: sync.code })
  }
  return result
}
