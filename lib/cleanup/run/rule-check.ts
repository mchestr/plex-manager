/**
 * The rule check of the act step (TS 8.8 step 6.5, owner-r2-1, E19, E31,
 * E32): for one candidate, read the holding rules and the options again and
 * decide with them. It never compares with an earlier read of the same act
 * step. Server-only; `act.ts` is its one caller.
 *
 * 1. A rule in Dry run or deleted drops (`ruleOff`). A rule that no longer
 *    covers the item drops (`libraryRemoved`, E32).
 * 2. A rule whose revision or options hash moved from its `blockBasis` gets
 *    `ruleBlocks()` again. Each remaining rule decides as in reconcile (TS
 *    8.4 step 3).
 * 3. No rule left: the item exits. A hold code or a block on every rule: no
 *    delete.
 * 4. The merge is computed again: an approved item whose action got less
 *    careful goes back to `leaving` (E31), and the delete uses the merged
 *    action.
 *
 * @module lib/cleanup/run/rule-check
 */

import "server-only"

import type { Block, RunOutcome } from "@/lib/cleanup/blocks"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { buildEvalContext } from "@/lib/cleanup/engine/context"
import { evaluateItem } from "@/lib/cleanup/engine/evaluate"
import { ruleCoversItem } from "@/lib/cleanup/engine/scope"
import type { EvalContext } from "@/lib/cleanup/engine/types"
import type { OutcomeDetail, OutcomeReason } from "@/lib/cleanup/outcomes"
import { ruleBlocks } from "@/lib/cleanup/rule-blocks"
import { exitItem, exitKind, ruleVerdict, type RuleVerdict } from "@/lib/cleanup/run/exit"
import type { LiveRule, ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { addReleased, mergeLive, mergeWrite, type ReleasedGroup } from "@/lib/cleanup/run/release"
import { optionsHash } from "@/lib/cleanup/run/run-claim"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import type { CleanupItem, Prisma } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { AuditEventType } from "@/lib/security/audit-log"
import { createLogger } from "@/lib/utils/logger"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import type { Level, Mode } from "@/lib/validations/cleanup-vocabulary"

const logger = createLogger("CLEANUP_ACT")

/** The act step stops with this outcome and block. */
export type Stop = { stop: RunOutcome; block: Block }
type RuleRow = { id: string; mode: string; revision: number; createdAt: Date; definition: Prisma.JsonValue }
/** What the rule check reads and adds to: the step's context, its first blocks and their basis, and its caches. */
export interface RuleCheckEnv { input: { runId: string; actorId: string; readStatus?: "complete" | "failed" | "busy" }; ctx: ReconcileContext; now: Date
  blocks: Map<string, Block[]>; basis: Map<string, string>; compiled: Map<string, Pick<LiveRule, "definition" | "compiled">>
  evals: Map<string, EvalContext | null>; groups: Map<string, ReleasedGroup>; result: { held: number } }

export const NEXT = "next" as const

/** A rule as the rule check reads it: compiled once per revision, with blocks again when its basis moved (step 6.5.3). */
function liveRuleOf(row: RuleRow, options: CleanupOptions, hash: string, env: RuleCheckEnv): LiveRule {
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
function evaluationFor(options: CleanupOptions, hash: string, env: RuleCheckEnv): EvalContext | null {
  if (!env.evals.has(hash)) {
    const { snapshot, evaluation, zone } = env.ctx
    env.evals.set(hash, snapshot && evaluation ? buildEvalContext({ now: env.now.getTime(), zone, facts: snapshot.header.facts,
      sources: snapshot.header.sources, shows: snapshot.levels.show?.items ?? [], live: evaluation.live, options }) : null)
  }
  return env.evals.get(hash) ?? null
}

/** Runs an exit write. A throw (the audit row is in its transaction) stops the step with `auditFailed`. */
export async function exitStep(write: () => Promise<unknown>): Promise<typeof NEXT | Stop> {
  try {
    await write()
    return NEXT
  } catch (error) {
    logger.error("cleanup.act_exit_failed", error)
    return { stop: "auditFailed", block: { code: "auditFailed" } }
  }
}

/** A write of the row as the step read it (`{ id, updatedAt }`). */
export const updateRow = (row: CleanupItem, data: Prisma.CleanupItemUpdateManyMutationInput) =>
  prisma.cleanupItem.updateMany({ where: { id: row.id, updatedAt: row.updatedAt }, data })

/** Step 6.5: the rule check. The row to delete with its merged action, or what to do instead. */
export async function ruleCheck(row: CleanupItem, options: CleanupOptions, env: RuleCheckEnv): Promise<{ row: CleanupItem; item: SnapshotItem } | typeof NEXT | Stop> {
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
  if (holdCode) return (await updateRow(row, { holdCode }), (env.result.held += 1), NEXT)
  if (holding.every((rule) => rule.blocks.length > 0)) return NEXT
  const merged = mergeLive(holding)
  const data = { ruleIds: holding.map((rule) => rule.id), ...(merged ? mergeWrite(row, merged) : {}) }
  const changed = Object.entries(data).some(([key, value]) => JSON.stringify(value) !== JSON.stringify(row[key as keyof CleanupItem]))
  if (!changed) return { row, item }
  if ((await updateRow(row, data)).count === 0 || data.state === "leaving" || (row.state === "leaving" && data.needsApproval)) return NEXT
  const fresh = await prisma.cleanupItem.findUnique({ where: { id: row.id } })
  return fresh ? { row: fresh, item } : NEXT
}
