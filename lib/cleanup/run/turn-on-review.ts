/**
 * The turn-on review (TS 10.3 `turnOnCleanupRule` steps 5 to 7, UX 4.6,
 * E28): what the turn-on page shows and what the action compares. The
 * loader (`getCleanupTurnOn`) and the action both call
 * `computeTurnOnReview()`, so the page and the check cannot differ.
 * Server-only.
 *
 * The compared set: from Dry run, the rule's matches on the newest complete
 * snapshot, without the titles deleted or rescued after that snapshot
 * (`exitedSince`, correctness review C-03). From a live mode (Change mode), its items in Leaving soon
 * (`leaving` or `approved`). The page sends back its `count` and
 * `keysHash` (the SHA-256 of the sorted keys) with the rule `revision` it
 * read, never the keys. The review also holds the counts, the turn-on
 * checks, the modes, the leave date, the Automatic pace of the budget
 * (TS 8.7), the titles larger than the daily space budget (E17, X13), the
 * typed count and `reviewedAt`.
 *
 * @module lib/cleanup/run/turn-on-review
 */

import "server-only"

import { createHash } from "node:crypto"

import { TYPED_APPROVAL_ABOVE } from "@/lib/cleanup/constants"
import { stableJson } from "@/lib/cleanup/editor/stable-json"
import { isDue, planBudget } from "@/lib/cleanup/engine/budget"
import { classify } from "@/lib/cleanup/engine/classify"
import { compileDefinition } from "@/lib/cleanup/engine/compile"
import { evaluateRule } from "@/lib/cleanup/engine/evaluate"
import { entryLeaveOn } from "@/lib/cleanup/engine/overlap"
import type { ItemClass, ItemResult } from "@/lib/cleanup/engine/types"
import { keysHash } from "@/lib/cleanup/keys-hash"
import { exitedSince } from "@/lib/cleanup/run/entries"
import type { LiveRule, ReconcileContext } from "@/lib/cleanup/run/reconcile"
import { loadReconcileContext } from "@/lib/cleanup/run/run-claim"
import { parseRuleStats } from "@/lib/cleanup/schema/stats"
import { modeAllowed, turnOnChecks } from "@/lib/cleanup/turn-on"
import type { TurnOnCheck, TurnOnMode } from "@/lib/cleanup/types/rule-parts"
import { prisma } from "@/lib/prisma"
import { parseRuleDefinition } from "@/lib/validations/cleanup-draft"
import type { RuleDefinition } from "@/lib/validations/cleanup-rule"
import type { Mode } from "@/lib/validations/cleanup-vocabulary"

/** The first 16 hex of the SHA-256 of the definition with sorted keys (TS 3.4 `definitionHash`, X7). */
export function definitionHash(definition: RuleDefinition): string {
  return createHash("sha256").update(stableJson(definition), "utf8").digest("hex").slice(0, 16)
}

/** One title of the compared set. `result` is its evaluation, or null for a Leaving soon row whose title the snapshot lacks. */
export interface ReviewItem {
  itemKey: string
  sizeBytes: number
  leaveOn: string | null
  result: ItemResult | null
}

export interface TurnOnReview {
  rule: { id: string; name: string; mode: Mode; revision: number; definition: RuleDefinition }
  /** The rule as `joinItems()` takes it once its mode is written: the chosen mode, no block. */
  joinRule: LiveRule
  mode: "reviewFirst" | "automatic"
  /** Largest first. */
  set: ReviewItem[]
  count: number
  keysHash: string
  bytes: number
  counts: Record<"checked" | "matches" | "protected" | "missing" | "cannotDelete" | "due", number>
  checks: TurnOnCheck[]
  modes: TurnOnMode[]
  /** From Dry run, the leave date of the new items. From a live mode, the earliest leave date of the set. */
  leaveAt: string
  /** The first and the last day of the Automatic pace. Null without items. */
  pace: { from: string; to: string } | null
  oversize: { itemKey: string; day: string }[]
  typedApprovalCount: number | null
  reviewedAt: string
  /** The context the review read: the action joins the items with it. */
  ctx: ReconcileContext
}

const CLASS_COUNTS: Partial<Record<ItemClass, "matches" | "protected" | "missing" | "cannotDelete">> = {
  match: "matches", protected: "protected", missing: "missing", cannotDelete: "cannotDelete",
}

/** The compared set and its review at `now`. Null for a rule that does not exist or whose definition does not parse. */
export async function computeTurnOnReview(ruleId: string, mode: "reviewFirst" | "automatic", now: Date = new Date()): Promise<TurnOnReview | null> {
  const [row, ctx] = await Promise.all([prisma.cleanupRule.findUnique({ where: { id: ruleId } }), loadReconcileContext({ now })])
  const parsed = row ? parseRuleDefinition(row.definition) : null
  if (!row || !parsed?.ok) return null
  const definition = parsed.definition
  const compiled = compileDefinition(definition)
  const { settings, snapshot, evaluation, today } = ctx
  const results = evaluation ? evaluateRule(compiled, snapshot?.levels[definition.level]?.items ?? [], evaluation) : []
  const counts = { checked: results.length, matches: 0, protected: 0, missing: 0, cannotDelete: 0, due: 0 }
  const fromDryRun = row.mode === "dryRun"
  const exited = fromDryRun ? await exitedSince(snapshot?.header.facts.takenAt) : new Set<string>()
  const matches: ReviewItem[] = []
  for (const result of results) {
    const kind = classify(result).class
    const key = CLASS_COUNTS[kind]
    if (key) counts[key] += 1
    if (kind === "match" && !exited.has(result.item.key)) matches.push({ itemKey: result.item.key, sizeBytes: result.item.sizeBytes ?? 0, leaveOn: null, result })
  }
  const byKey = new Map(results.map((result) => [result.item.key, result]))
  const rows = fromDryRun ? [] : await prisma.cleanupItem.findMany({ where: { ruleIds: { has: ruleId }, state: { in: ["leaving", "approved"] } } })
  const set = (fromDryRun ? matches : rows.map((item) => ({ itemKey: item.itemKey, sizeBytes: Number(item.sizeBytes), leaveOn: item.leaveOn,
    result: byKey.get(item.itemKey) ?? null }))).sort((a, b) => b.sizeBytes - a.sizeBytes || (a.itemKey < b.itemKey ? -1 : 1))
  counts.due = set.filter((item) => isDue(item.leaveOn, today, settings.holdUntil)).length
  const days = set.flatMap((item) => (item.leaveOn ? [item.leaveOn] : [])).sort()
  const leaveAt = fromDryRun ? entryLeaveOn([definition], today, settings.holdUntil) : (days[0] ?? today)
  const level = definition.level
  const { plan, oversize } = planBudget({ budget: settings.options.budget, usedToday: { items: 0, bytes: 0 }, today, holdUntil: settings.holdUntil,
    candidates: set.map((item) => ({ itemKey: item.itemKey, level, titleKey: item.result?.item.titleKey ?? item.itemKey, leaveOn: item.leaveOn ?? leaveAt,
      sizeBytes: item.sizeBytes })) })
  const planned = [...plan.values()].sort()
  const header = snapshot?.header
  const checks = turnOnChecks({ now: now.getTime(), feature: { enabled: settings.enabled, paused: settings.pausedAt !== null }, rule: { id: row.id, definition },
    snapshot: header ? { finishedAt: header.finishedAt ?? header.startedAt, sources: header.sources, facts: header.facts } : null,
    options: settings.options, dryRuns: parseRuleStats(row.stats).dryRuns, definitionHash: definitionHash(definition),
    counts: { count: set.length, checked: counts.checked, cannotDelete: counts.cannotDelete }, firstBatch: fromDryRun, notices: settings.runtime.notices })
  return {
    rule: { id: row.id, name: row.name, mode: row.mode as Mode, revision: row.revision, definition },
    joinRule: { id: row.id, mode, revision: row.revision + 1, createdAt: row.createdAt, definition, compiled, blocks: [] },
    mode, set, count: set.length, keysHash: keysHash(set.map((item) => item.itemKey)), bytes: set.reduce((sum, item) => sum + item.sizeBytes, 0),
    counts, checks, modes: modeAllowed(checks, level), leaveAt, pace: planned.length > 0 ? { from: planned[0], to: planned[planned.length - 1] } : null,
    oversize, typedApprovalCount: mode === "automatic" && set.length > TYPED_APPROVAL_ABOVE ? set.length : null, reviewedAt: now.toISOString(), ctx,
  }
}
