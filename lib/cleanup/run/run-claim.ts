/**
 * The run claim with its change check (TS 8.1 item 7, 8.3 step 14, E19,
 * deviation D16), and the context that every holder of the run claim
 * reconciles with. Server-only. The plain claim functions are
 * `lib/cleanup/claims.ts`.
 *
 * 1. `takeRunClaim()` takes `runClaimAt` and reads the baseline right after
 *    the claim commits: the rules (`id`, `mode`, `revision`) and a hash of
 *    the options.
 * 2. `releaseRunClaim(claim, baseline)` reads them again. Equal values (the
 *    usual case) cost two small queries. A difference, the holder's own
 *    writes included, runs reconcile (TS 8.4) on the fresh definitions,
 *    which only applies exits, then reads again. At most 2 extra rounds.
 * 3. A save can still commit after the last read and before the release
 *    (safety-r3-4). So after the release, the rules and the options are read
 *    once more. A difference: claim again, reconcile and release again with
 *    the same check, within the same 2 rounds. Busy: the new holder runs
 *    the check.
 *
 * `loadReconcileContext()` reads the settings, the newest complete snapshot
 * with its live facts, and every live rule with its safety stops.
 *
 * @module lib/cleanup/run/run-claim
 */

import "server-only"

import { createHash } from "node:crypto"

import type { Block } from "@/lib/cleanup/blocks"
import { type Claim, claim, release } from "@/lib/cleanup/claims"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { buildEvalContext } from "@/lib/cleanup/engine/context"
import { stableJson } from "@/lib/cleanup/editor/stable-json"
import { loadLiveFacts } from "@/lib/cleanup/live-facts"
import { ruleBlocks } from "@/lib/cleanup/rule-blocks"
import { type LiveRule, reconcile, type ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { CLEANUP_SETTINGS_ID, readCleanupSettingsRow, serverZone } from "@/lib/cleanup/settings"
import { loadNewestSnapshot } from "@/lib/cleanup/snapshot/cache"
import { prisma } from "@/lib/prisma"
import { SYSTEM_ACTOR } from "@/lib/session-revocation"
import { dayKey } from "@/lib/utils/zoned-time"
import { type CleanupOptions, parseCleanupOptions } from "@/lib/validations/cleanup-options"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import type { Mode } from "@/lib/validations/cleanup-vocabulary"

/** The reconcile rounds of the change check, before and after the release together. @internal */
export const CHANGE_CHECK_ROUNDS = 2

/** Loads the reconcile context at `now`: the settings, the newest complete snapshot, its live facts and every live rule with `ruleBlocks()`. */
export async function loadReconcileContext(input: { now?: Date; runId?: string | null; actorId?: string } = {}): Promise<ReconcileContext> {
  const now = input.now ?? new Date()
  const [settings, zone, snapshot, rows] = await Promise.all([
    readCleanupSettingsRow(), serverZone(), loadNewestSnapshot(),
    prisma.cleanupRule.findMany({ where: { mode: { not: "dryRun" } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      select: { id: true, mode: true, revision: true, createdAt: true, definition: true } }),
  ])
  const { options } = settings
  const header = snapshot?.header
  const live = header ? await loadLiveFacts(now, header.facts.users) : null
  const evaluation = snapshot && live ? buildEvalContext({ now: now.getTime(), zone, facts: snapshot.header.facts, sources: snapshot.header.sources,
    shows: snapshot.levels.show?.items ?? [], live, options }) : null
  const blockSnapshot = header ? { finishedAt: header.finishedAt ?? header.startedAt, sources: header.sources, facts: header.facts } : null
  const rules = new Map<string, LiveRule>()
  for (const row of rows) {
    const parsed = parseRuleDefinition(row.definition)
    const definition = parsed.ok ? parsed.definition : null
    const blocks: Block[] = definition ? ruleBlocks(definition, blockSnapshot, { now: now.getTime(), options, ruleId: row.id }) : [{ code: "invalid", ruleId: row.id }]
    if (definition && snapshot && !snapshot.levels[definition.level]) blocks.push({ code: "noData", ruleId: row.id }) // a part that did not load
    rules.set(row.id, { ...row, mode: row.mode as Mode, definition, compiled: definition && compileDefinition(definition), blocks })
  }
  return { now, today: dayKey(now.getTime(), zone), zone, runId: input.runId ?? null, actorId: input.actorId ?? SYSTEM_ACTOR, settings, snapshot,
    evaluation, rules }
}

/** What the change check compares: every rule's `id`, `mode` and `revision` (by id), and the options hash. */
export interface RunBaseline {
  rules: { id: string; mode: string; revision: number }[]
  optionsHash: string
}

/** The first 16 hex of the SHA-256 of the options with sorted keys. The act step's `blockBasis` uses it too (TS 8.8 step 4). */
export function optionsHash(options: CleanupOptions): string {
  return createHash("sha256").update(stableJson(options), "utf8").digest("hex").slice(0, 16)
}

/** Reads the baseline: two small queries. @internal */
export async function readRunBaseline(): Promise<RunBaseline> {
  const [rules, settings] = await Promise.all([
    prisma.cleanupRule.findMany({ select: { id: true, mode: true, revision: true }, orderBy: { id: "asc" } }),
    prisma.cleanupSettings.findUnique({ where: { id: CLEANUP_SETTINGS_ID }, select: { options: true } }),
  ])
  return { rules, optionsHash: optionsHash(parseCleanupOptions(settings?.options)) }
}

/** True when nothing that reconcile reads changed. @internal */
export function sameBaseline(a: RunBaseline, b: RunBaseline): boolean {
  return a.optionsHash === b.optionsHash && a.rules.length === b.rules.length &&
    a.rules.every((rule, i) => rule.id === b.rules[i].id && rule.mode === b.rules[i].mode && rule.revision === b.rules[i].revision)
}

/** The run claim and the baseline read right after it committed. */
export interface HeldRunClaim {
  claim: Claim
  baseline: RunBaseline
}

/** Takes the run claim at `now` and reads its baseline. Null while another holder has it (busy). */
export async function takeRunClaim(now: Date = new Date()): Promise<HeldRunClaim | null> {
  const held = await claim("runClaimAt", now)
  if (!held) return null
  try {
    return { claim: held, baseline: await readRunBaseline() }
  } catch (error) {
    await release(held)
    throw error
  }
}

/**
 * Releases the run claim after the change check (TS 8.1 item 7). Returns
 * the reconcile rounds it ran (0 to {@link CHANGE_CHECK_ROUNDS}). A lost
 * claim runs no reconcile. An error of a reconcile releases, then throws.
 */
export async function releaseRunClaim(held: Claim, baseline: RunBaseline, options: { actorId?: string; runId?: string | null } = {}): Promise<{ rounds: number }> {
  let seen = baseline
  let rounds = 0
  let current: Claim | null = held
  while (current) {
    try {
      while (rounds < CHANGE_CHECK_ROUNDS && !current.lost.aborted) {
        const fresh = await readRunBaseline()
        if (sameBaseline(seen, fresh)) break
        await reconcile({ ctx: await loadReconcileContext({ runId: options.runId, actorId: options.actorId }) })
        rounds += 1
        seen = fresh
      }
    } finally {
      await release(current)
    }
    if (rounds >= CHANGE_CHECK_ROUNDS || sameBaseline(seen, await readRunBaseline())) break
    current = await claim("runClaimAt") // busy: the new holder runs the check
  }
  return { rounds }
}
