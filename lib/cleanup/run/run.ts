/**
 * The run (TS 8.3, E10, E13, E14, E19): `runCleanup()` evaluates the rules,
 * writes their statistics and dry-run history, and, while the feature is on
 * and not paused, changes Leaving soon. Server-only.
 *
 * 1. Read the settings. A run is live only with the feature on, not paused,
 *    and no `dryRunRuleIds`. A live run takes the run claim. Busy: a
 *    scheduled run adds itself again after 10 minutes, up to 6 times, then
 *    writes a run row with outcome `busy`. An admin run writes `CLEANUP_RUN`
 *    with `runId: null` and outcome `busy`.
 * 2. Load the newest complete snapshot and its context. Create the run row.
 * 3. Evaluate every rule (or the dry-run rules), between rules checking the
 *    signal. A definition that does not parse is skipped and logged
 *    (`cleanup.rule_invalid`, block `invalid`). Each rule gets `lastEval`;
 *    a Dry run rule, or any rule of a dry run, gets a dry-run entry. Runs
 *    never change `revision`.
 * 4. Live: read the settings again (off or paused: record the block), recover
 *    `deleting` rows, reconcile, and add new matches unless `entries` is
 *    false. Read the settings again, and run the act step on request
 *    (`reconciled: true`). Only the nightly run acts: a run that an admin
 *    started never deletes (UX 0.4 item 6).
 * 5. Not live, with a live rule: record the feature block. Prune and expire.
 * 6. Write the run row and `CLEANUP_RUN`, release the claim with the change
 *    check (`releaseRunClaim()`), and ask for a collection sync after changes.
 *
 * A database error throws: the run row then has no `finishedAt`, and the
 * claim is still released. The run row and its audit row live in
 * `run-row.ts`, which the act job (TS 9.3) uses too.
 *
 * @module lib/cleanup/run/run
 */

import "server-only"

import type { Block, RunOutcome } from "@/lib/cleanup/blocks"
import { requestCollectionSync } from "@/lib/cleanup/collections/request"
import { classify } from "@/lib/cleanup/engine/classify"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { evaluateRule } from "@/lib/cleanup/engine/evaluate"
import { ruleOverlaps } from "@/lib/cleanup/engine/overlap"
import { ruleStats } from "@/lib/cleanup/engine/stats"
import type { CompiledRule, ItemResult } from "@/lib/cleanup/engine/types"
import { ruleBlocks } from "@/lib/cleanup/rule-blocks"
import { type ActResult, actStep } from "@/lib/cleanup/run/act"
import { addNewMatches, type EntriesResult } from "@/lib/cleanup/run/entries"
import { pruneCleanup } from "@/lib/cleanup/run/prune"
import { reconcile, type ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { recoverDeleting } from "@/lib/cleanup/run/recover"
import { loadReconcileContext, releaseRunClaim, takeRunClaim } from "@/lib/cleanup/run/run-claim"
import { auditBusyRun, busyRunRow, createRunRow, finishRun, type RunCounts } from "@/lib/cleanup/run/run-row"
import { definitionHash } from "@/lib/cleanup/run/turn-on-review"
import { DRY_RUNS_KEPT, parseRuleStats } from "@/lib/cleanup/schema/stats"
import { isLive, readCleanupSettingsRow } from "@/lib/cleanup/settings"
import type { CleanupRule } from "@/lib/generated/prisma/client"
import { prisma } from "@/lib/prisma"
import { addJob } from "@/lib/queue/client"
import { JOB_TYPES } from "@/lib/queue/types"
import { createLogger } from "@/lib/utils/logger"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import type { Mode } from "@/lib/validations/cleanup-vocabulary"

const logger = createLogger("CLEANUP_RUN")

/** A busy scheduled run or act job adds itself again this many times, 10 minutes apart (TS 8.3 step 3, 9.3). */
export const BUSY_WAITS = 6
export const BUSY_DELAY_MS = 10 * 60_000
/** Every cleanup job add (TS 9.2). */
export const CLEANUP_JOB_OPTIONS = { attempts: 1, removeOnComplete: true, removeOnFail: { age: 7 * 24 * 3600 } }

export interface RunCleanupOptions { trigger: "scheduled" | "admin" | "create"; actorId: string; dryRunRuleIds?: string[]; act: boolean; entries?: boolean
  readStatus?: "complete" | "failed" | "busy"; waits?: number; signal?: AbortSignal; now?: Date }
export type RunCleanupResult = { busy: true; retry?: number } | ({ busy: false; runId: string; outcome: RunOutcome } & RunCounts)

const featureBlock = (s: { enabled: boolean }): Block => ({ code: s.enabled ? "paused" : "off" })

/** Step 3 of TS 8.3 for a busy claim. */
async function busyRun(options: RunCleanupOptions): Promise<RunCleanupResult> {
  const { trigger, actorId } = options
  if (trigger !== "scheduled") return (await auditBusyRun(trigger, actorId), { busy: true })
  const waits = options.waits ?? 0
  if (waits >= BUSY_WAITS) return (await busyRunRow("run", trigger, actorId), { busy: true })
  const payload = { trigger, act: options.act, entries: options.entries, readStatus: options.readStatus, waits: waits + 1 }
  await addJob(JOB_TYPES.CLEANUP_RUN, payload, { ...CLEANUP_JOB_OPTIONS, delay: BUSY_DELAY_MS })
  return { busy: true, retry: waits + 1 }
}

interface Evaluated { rule: CleanupRule; compiled: CompiledRule; results: ItemResult[]; matches: ItemResult[] }

/** Step 7 of TS 8.3: each rule's results, `lastEval` and dry-run entry. Stops between rules on the signal. */
async function evaluateRules(rules: readonly CleanupRule[], ctx: ReconcileContext, dry: boolean, signal?: AbortSignal) {
  const evaluated: Evaluated[] = []
  const invalid: Block[] = []
  for (const rule of rules) {
    if (signal?.aborted) return { evaluated, invalid, stopped: true }
    const parsed = parseRuleDefinition(rule.definition)
    if (!parsed.ok) {
      logger.warn("cleanup.rule_invalid", { ruleId: rule.id })
      invalid.push({ code: "invalid", ruleId: rule.id })
      continue
    }
    const compiled = compileDefinition(parsed.definition)
    const results = ctx.evaluation ? evaluateRule(compiled, ctx.snapshot?.levels[parsed.definition.level]?.items ?? [], ctx.evaluation) : []
    evaluated.push({ rule, compiled, results, matches: results.filter((r) => classify(r).class === "match") })
  }
  const header = ctx.snapshot?.header
  const all = evaluated.map((e) => ({ ruleId: e.rule.id, items: e.matches.map((m) => ({ key: m.item.key, showKey: m.item.showKey })) }))
  for (const [i, { rule, compiled, results, matches }] of evaluated.entries()) {
    if (!header) break
    const stats = ruleStats(compiled, results)
    const definition = parseRuleDefinition(rule.definition)
    const blocks = ctx.rules.get(rule.id)?.blocks ?? (definition.ok ? ruleBlocks(definition.definition, { finishedAt: header.finishedAt ?? header.startedAt,
      sources: header.sources, facts: header.facts }, { now: ctx.now.getTime(), options: ctx.settings.options, ruleId: rule.id }) : [])
    const largest = [...matches].sort((a, b) => (b.item.sizeBytes ?? 0) - (a.item.sizeBytes ?? 0)).slice(0, 4).map((m) => m.item.ratingKey)
    const at = ctx.now.toISOString()
    const lastEval = { runId: ctx.runId ?? "", at, snapshotId: header.id, checked: stats.checked, matches: stats.matches, bytes: stats.bytes,
      nearMisses: stats.tabs.nearMisses, protected: stats.tabs.protected, missing: stats.tabs.missing, cannotDelete: stats.tabs.cannotDelete, largest,
      overlaps: ruleOverlaps(all[i], all).map((overlap) => ({ ...overlap })), blocks }
    const isDry = dry || rule.mode === "dryRun"
    const { dryRuns } = parseRuleStats(rule.stats)
    const entry = definition.ok ? [{ at, runId: ctx.runId ?? "", snapshotId: header.id, matches: stats.matches, bytes: stats.bytes,
      definitionHash: definitionHash(definition.definition) }] : []
    const stored = { v: 1, lastEval, dryRuns: isDry ? [...dryRuns, ...entry].slice(-DRY_RUNS_KEPT) : dryRuns }
    await prisma.cleanupRule.updateMany({ where: { id: rule.id }, data: { stats: stored, ...(isDry ? { lastDryRunAt: ctx.now } : {}) } })
  }
  return { evaluated, invalid, stopped: false }
}

/** Steps 4 to 13 under the claim (or with none for a run that is not live). */
async function claimedRun(options: RunCleanupOptions, live: boolean, now: Date, hold: { runId: string | null }) {
  const dry = options.dryRunRuleIds !== undefined
  const base = await loadReconcileContext({ now, actorId: options.actorId })
  const rules = await prisma.cleanupRule.findMany({ where: dry ? { id: { in: options.dryRunRuleIds } } : {}, orderBy: [{ createdAt: "asc" }, { id: "asc" }] })
  const runId = await createRunRow({ kind: dry ? "dryRun" : "run", trigger: options.trigger, actorId: options.actorId, snapshotId: base.snapshot?.header.id,
    ruleIds: rules.map((rule) => rule.id) })
  hold.runId = runId
  const ctx: ReconcileContext = { ...base, runId }
  const { evaluated, invalid, stopped } = await evaluateRules(rules, ctx, dry, options.signal)
  const liveRules = [...ctx.rules.values()]
  const blocks: Block[] = [...invalid, ...(dry ? [] : liveRules.flatMap((rule) => rule.blocks.filter((b) => b.code !== "invalid")))]
  let entries: EntriesResult | null = null
  let act: ActResult | null = null
  let reconciled = 0
  if (live && !stopped) {
    const again = await readCleanupSettingsRow()
    if (!isLive(again)) blocks.push(featureBlock(again))
    else {
      await prisma.$transaction((tx) => recoverDeleting(tx, { clearApproval: false }))
      const result = await reconcile({ ctx })
      reconciled = result.updated + result.released + result.rescued
      if (options.entries !== false) entries = await addNewMatches(ctx)
      const third = options.act && options.trigger === "scheduled" ? await readCleanupSettingsRow() : null
      if (third && !isLive(third)) blocks.push(featureBlock(third))
      else if (third) act = await actStep({ runId, trigger: options.trigger, actorId: options.actorId, signal: options.signal, now, reconciled: true,
        readStatus: options.readStatus })
    }
  }
  if (!live && !isLive(ctx.settings) && liveRules.length > 0) blocks.push(featureBlock(ctx.settings))
  blocks.push(...(act?.blocks ?? []))
  await pruneCleanup(now)
  const paused = blocks.some((b) => b.code === "off" || b.code === "paused")
  const allBlocked = liveRules.length > 0 && liveRules.every((rule) => rule.blocks.length > 0)
  const actStop = act && !["finished", "blocked"].includes(act.outcome) ? act.outcome : null
  const outcome: RunOutcome = stopped ? "stopped" : actStop ?? (!ctx.snapshot ? "noData" : dry ? "dryRun" : paused ? "paused" : (entries?.held ?? 0) > 0 ? "held"
    : allBlocked || act?.outcome === "blocked" ? "blocked" : "finished")
  const ruleEntries = rules.map((rule) => {
    const entry = entries?.rules.find((e) => e.ruleId === rule.id)
    const result = evaluated.find((e) => e.rule.id === rule.id)
    return { ruleId: rule.id, mode: rule.mode as Mode, matches: result?.matches.length ?? 0, joined: entry?.joined.length ?? 0, held: entry?.heldKeys.length ?? 0,
      blocks: result ? (ctx.rules.get(rule.id)?.blocks ?? []) : invalid.filter((b) => b.ruleId === rule.id) }
  })
  const counts = await finishRun(runId, { kind: dry ? "dryRun" : "run", trigger: options.trigger, actorId: options.actorId, outcome, blocks, entries: ruleEntries,
    checked: evaluated.reduce((sum, e) => sum + e.results.length, 0), matched: evaluated.reduce((sum, e) => sum + e.matches.length, 0),
    joined: entries?.joined ?? 0, held: entries?.held ?? 0, deferred: act?.deferred ?? 0 })
  const changed = live && reconciled + counts.joined + counts.deleted + counts.failed + counts.rescued + (act?.held ?? 0) > 0
  return { result: { busy: false as const, runId, outcome, ...counts }, changed }
}

/** One run (TS 8.3). Returns `{ busy: true }` when the claim is busy. Throws on a database error, after the claim is released. */
export async function runCleanup(options: RunCleanupOptions): Promise<RunCleanupResult> {
  const now = options.now ?? new Date()
  const live = options.dryRunRuleIds === undefined && isLive(await readCleanupSettingsRow())
  const held = live ? await takeRunClaim(now) : null
  if (live && !held) return busyRun(options)
  const hold = { runId: null as string | null }
  const release = () => (held ? releaseRunClaim(held.claim, held.baseline, { actorId: options.actorId, runId: hold.runId }) : Promise.resolve(null))
  let done: Awaited<ReturnType<typeof claimedRun>>
  try {
    done = await claimedRun(options, live, now, hold)
  } catch (error) {
    await release().catch((releaseError: unknown) => logger.error("cleanup.run_release_failed", releaseError, { runId: hold.runId }))
    throw error
  }
  await release()
  if (done.changed) await requestCollectionSync("run")
  return done.result
}
