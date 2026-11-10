/* eslint max-lines: ["error", { "max": 215, "skipBlankLines": true, "skipComments": true }] -- cohesive: the act step of TS 8.8 with its per-item checks in their fixed order, so no delete can skip one */
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
 * The rule check (step 6.5, owner-r2-1) reads the holding rules and the
 * options for every candidate and never compares with an earlier read. A
 * rule in Dry run or deleted drops (`ruleOff`), a rule that no longer covers
 * the item drops (`libraryRemoved`, E32). A rule whose revision or options
 * hash moved from its `blockBasis` gets `ruleBlocks()` again. Each remaining
 * rule decides as in reconcile (TS 8.4 step 3). No rule left: the item exits.
 * A hold code or a block on every rule: no delete. The merge is computed
 * again: an approved item whose action got less careful goes back to
 * `leaving` (E31), and the delete uses the merged action.
 *
 * @module lib/cleanup/run/act
 */

import "server-only"

import type { Block, RunOutcome } from "@/lib/cleanup/blocks"
import { isDue, planBudget } from "@/lib/cleanup/engine/budget"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { buildEvalContext } from "@/lib/cleanup/engine/context"
import { evaluateItem } from "@/lib/cleanup/engine/evaluate"
import { ruleCoversItem } from "@/lib/cleanup/engine/scope"
import type { EvalContext } from "@/lib/cleanup/engine/types"
import type { OutcomeDetail, OutcomeReason } from "@/lib/cleanup/outcomes"
import { ruleBlocks } from "@/lib/cleanup/rule-blocks"
import { groupBatches, readUsedToday } from "@/lib/cleanup/run/batches"
import { deleteItem, exitDeleted } from "@/lib/cleanup/run/delete"
import { exitItem, exitKind, ruleVerdict, type RuleVerdict } from "@/lib/cleanup/run/exit"
import { loadActServices, preDelete, prepareChecks, sinceOf, type PreDeleteEnv } from "@/lib/cleanup/run/pre-delete"
import { type LiveRule, reconcile, type ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { recoverDeleting } from "@/lib/cleanup/run/recover"
import { addReleased, auditReleased, mergeLive, mergeWrite, type ReleasedGroup } from "@/lib/cleanup/run/release"
import { loadReconcileContext, optionsHash } from "@/lib/cleanup/run/run-claim"
import { parseArrRef } from "@/lib/cleanup/schema/runtime"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { type CleanupSettingsRow, isLive, readCleanupSettingsRow } from "@/lib/cleanup/settings"
import { runOverseerrJob } from "@/lib/connections/overseerr-cleanup"
import type { CleanupItem, Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import type { Level, Mode } from "@/lib/validations/cleanup-vocabulary"

const logger = createLogger("CLEANUP_ACT")

export interface ActInput { runId: string; trigger: string; actorId: string; signal?: AbortSignal; now?: Date; reconciled: boolean
  readStatus?: "complete" | "failed" | "busy" }
/** Counts and codes only. `seen`: the keys planned for today that this step took (the job's rounds, TS 9.3). */
export interface ActResult { outcome: RunOutcome; blocks: Block[]; deleted: number; deferred: number; held: number; seen: string[] }
type Stop = { stop: RunOutcome; block: Block }
type RuleRow = { id: string; mode: string; revision: number; createdAt: Date; definition: Prisma.JsonValue }
interface Env { input: ActInput; ctx: ReconcileContext; now: Date; blocks: Map<string, Block[]>; basis: Map<string, string>; blocked: Set<string>
  compiled: Map<string, Pick<LiveRule, "definition" | "compiled">>; evals: Map<string, EvalContext | null>; groups: Map<string, ReleasedGroup>
  pre: Omit<PreDeleteEnv, "options">; result: ActResult }

const NEXT = "next" as const
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

/** A rule as the rule check reads it: compiled once per revision, with blocks again when its basis moved (step 6.5.3). */
function liveRuleOf(row: RuleRow, options: CleanupOptions, hash: string, env: Env): LiveRule {
  const key = `${row.id}:${row.revision}`
  const parsed = env.compiled.has(key) ? null : parseRuleDefinition(row.definition)
  if (parsed) env.compiled.set(key, parsed.ok ? { definition: parsed.definition, compiled: compileDefinition(parsed.definition) } : { definition: null, compiled: null })
  const entry = env.compiled.get(key) ?? { definition: null, compiled: null }
  const { snapshot } = env.ctx
  const header = snapshot?.header
  const fresh = (definition: RuleDefinition | null): Block[] => !definition ? [{ code: "invalid", ruleId: row.id }] : [...ruleBlocks(definition, header
    ? { finishedAt: header.finishedAt ?? header.startedAt, sources: header.sources, facts: header.facts } : null, { now: env.now.getTime(), options, ruleId: row.id }),
    ...(snapshot && !snapshot.levels[definition.level] ? [{ code: "noData", ruleId: row.id }] : []),
    ...(env.input.readStatus === "failed" || env.input.readStatus === "busy" ? [{ code: "readFailed", ruleId: row.id }] : [])]
  const blocks = env.basis.get(row.id) === `${row.revision}:${hash}` ? (env.blocks.get(row.id) ?? []) : fresh(entry.definition)
  return { id: row.id, mode: row.mode as Mode, revision: row.revision, createdAt: row.createdAt, ...entry, blocks }
}

/** The evaluation context of `options`, built once per options hash on the step's snapshot and live facts. */
function evaluationFor(options: CleanupOptions, hash: string, env: Env): EvalContext | null {
  if (!env.evals.has(hash)) {
    const { snapshot, evaluation, zone } = env.ctx
    env.evals.set(hash, snapshot && evaluation ? buildEvalContext({ now: env.now.getTime(), zone, facts: snapshot.header.facts,
      sources: snapshot.header.sources, shows: snapshot.levels.show?.items ?? [], live: evaluation.live, options }) : null)
  }
  return env.evals.get(hash) ?? null
}

/** Runs an exit write. A throw (the audit row is in its transaction) stops the step with `auditFailed`. */
async function exitStep(write: () => Promise<unknown>): Promise<typeof NEXT | Stop> {
  try {
    await write()
    return NEXT
  } catch (error) {
    logger.error("cleanup.act_exit_failed", error)
    return { stop: "auditFailed", block: { code: "auditFailed" } }
  }
}

const update = (row: CleanupItem, data: Prisma.CleanupItemUpdateManyMutationInput) =>
  prisma.cleanupItem.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data })

/** Step 6.5: the rule check. The row to delete with its merged action, or what to do instead. */
async function ruleCheck(row: CleanupItem, options: CleanupOptions, env: Env): Promise<{ row: CleanupItem; item: SnapshotItem } | typeof NEXT | Stop> {
  const item = env.ctx.snapshot?.levels[row.level as Level]?.byKey.get(row.itemKey)
  const hash = optionsHash(options)
  const evaluation = evaluationFor(options, hash, env)
  if (!item || !evaluation) return NEXT // reconcile decides for an item that left Plex
  const rows = await prisma.cleanupRule.findMany({ where: { id: { in: row.ruleIds } }, select: { id: true, mode: true, revision: true, createdAt: true, definition: true } })
  const dropped: { ruleId: string; reason: OutcomeReason; detail?: OutcomeDetail }[] = []
  const holding: LiveRule[] = []
  let holdCode: string | null = null
  const sinceS = Math.floor((row.enteredAt ?? row.createdAt).getTime() / 1000)
  for (const id of row.ruleIds) {
    const found = rows.find((r) => r.id === id)
    const rule = found && found.mode !== "dryRun" ? liveRuleOf(found, options, hash, env) : null
    const verdict: RuleVerdict = !rule ? { keep: false, reason: "ruleOff" } : rule.definition && !ruleCoversItem(rule.definition, item)
      ? { keep: false, reason: "libraryRemoved" } : rule.blocks.length > 0 || !rule.compiled ? { keep: true }
      : ruleVerdict(rule.compiled, evaluateItem(rule.compiled, item, evaluation), sinceS)
    if (!verdict.keep) dropped.push({ ruleId: id, reason: verdict.reason, detail: verdict.detail })
    else if (rule) {
      holding.push(rule)
      holdCode ??= verdict.holdCode ?? null
    }
  }
  if (holding.length === 0) {
    const first = dropped[0] ?? { ruleId: "", reason: "ruleOff" }
    const kind = exitKind(row.state, first.reason)
    const grouped = first.ruleId !== "" && (first.reason === "ruleOff" || first.reason === "libraryRemoved")
    return exitStep(async () => {
      const exit = await exitItem(row, { kind, reason: first.reason, detail: first.detail, runId: env.input.runId, actorId: env.input.actorId,
        audit: grouped || kind !== "rescued" ? null : AuditEventType.CLEANUP_ITEM_RESCUED })
      if (exit.exited && grouped) addReleased(env.groups, first.ruleId, first.reason as ReleasedGroup["reason"], row.itemKey)
    })
  }
  if (holdCode) return (await update(row, { holdCode }), (env.result.held += 1), NEXT)
  if (holding.every((rule) => rule.blocks.length > 0)) return NEXT
  const merged = mergeLive(holding)
  const data = { ruleIds: holding.map((rule) => rule.id), ...(merged ? mergeWrite(row, merged) : {}) }
  const changed = Object.entries(data).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(row[key as keyof CleanupItem]))
  if (!changed) return { row, item }
  if ((await update(row, data)).count === 0 || data.state === "leaving" || (row.state === "leaving" && data.needsApproval)) return NEXT
  const fresh = await prisma.cleanupItem.findUnique({ where: { id: row.id } })
  return fresh ? { row: fresh, item } : NEXT
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
  if (row.state === "approved" && !(await stillAdmin(row.approvedBy))) return (await update(row, { state: "leaving", approvedAt: null, approvedBy: null }), NEXT)
  if (row.sizeBytes === 0n) return (await update(row, { holdCode: "noValue:size" }), (env.result.held += 1), NEXT)
  const checked = await ruleCheck(row, settings.options, env)
  if (checked === NEXT || "stop" in checked) return checked
  const { item, row: fresh } = checked
  const arr = parseArrRef(fresh.arr)
  if (!arr) return NEXT
  const show = item.showKey ? (env.ctx.snapshot?.levels.show?.byKey.get(item.showKey) ?? null) : null
  const pre = await preDelete({ row: fresh, arr, item, show }, { ...env.pre, options: settings.options })
  const { runId } = env.input
  if (pre.kind === "defer") return (await update(fresh, { deferredAt: env.now }), (env.result.deferred += 1), NEXT)
  if (pre.kind === "hold") {
    await update(fresh, { holdCode: pre.code })
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
