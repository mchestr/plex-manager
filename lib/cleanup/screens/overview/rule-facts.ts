/**
 * The three facts of a rule card by mode (UX 4.1.3 item 4, TS 12.7 items 1
 * and 12, X7). Pure and client-safe.
 *
 * | Mode | Facts |
 * |---|---|
 * | Dry run | Matches today (live), Dry runs (of the saved definition, one per library read), Members see |
 * | Review first | Matches today with the new ones, In Leaving soon, Waiting for you (its deletion batch) |
 * | Automatic | Matches today, In Leaving soon with the next leave date, Deleted since it was turned on |
 *
 * "New since the last run" counts the live matches that no item row holds
 * for the rule yet: each run puts the new matches in Leaving soon.
 *
 * @module lib/cleanup/screens/overview/rule-facts
 */

import { growthWeeks } from "@/lib/cleanup/preview/compute"
import type { Batch } from "@/lib/cleanup/run/batches"
import type { DefinitionEvaluation } from "@/lib/cleanup/screens/overview/evaluate"
import { IN_LEAVING_SOON, nextLeave } from "@/lib/cleanup/screens/overview/library"
import type { StoredRule } from "@/lib/cleanup/screens/overview/read"
import type { DryRunSummary } from "@/lib/cleanup/turn-on"
import type { RuleFacts } from "@/lib/cleanup/types/rule-parts"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { dayKey } from "@/lib/utils/zoned-time"

export interface RuleFactsInput {
  rule: Pick<StoredRule, "mode" | "turnedOnAt">
  /** Null without library data for the rule's level. */
  evaluation: DefinitionEvaluation | null
  /** The item rows that hold the rule, in any state. */
  rows: readonly CleanupItem[]
  /** The rule's own deletion batch. */
  batch: Batch | undefined
  /** The rule's deleted outcomes (Automatic rules). */
  deleted: readonly { freedBytes: bigint; actedAt: Date }[]
  runs: DryRunSummary
  today: string
  zone: string
  holdUntil: string | null
  growthBytesPerMonth: number | null
}

const day = (date: Date | string, zone: string) => dayKey(typeof date === "string" ? Date.parse(date) : date.getTime(), zone)

/** The card facts of one rule. The facts that its mode does not show are null. */
export function ruleFacts(input: RuleFactsInput): RuleFacts {
  const { rule, evaluation, runs, today, zone, batch } = input
  const held = new Set(input.rows.map((row) => row.itemKey))
  const matches = {
    count: evaluation?.matches.length ?? 0,
    bytes: String(evaluation?.bytes ?? 0),
    growthWeeks: evaluation ? growthWeeks(evaluation.bytes, input.growthBytesPerMonth) : null,
    newSinceLastRun: rule.mode === "reviewFirst" && evaluation ? evaluation.matches.filter((item) => !held.has(item.key)).length : null,
  }
  const dryRuns = { count: runs.count, sinceDay: runs.firstAt ? day(runs.firstAt, zone) : null, min: runs.min, max: runs.max, steady: runs.steady }
  if (rule.mode === "dryRun") return { matches, dryRuns, leaving: null, waiting: null, deleted: null }

  const inLeaving = input.rows.filter((row) => IN_LEAVING_SOON.includes(row.state))
  const next = nextLeave(inLeaving, today, input.holdUntil, new Set(batch?.items.map((item) => item.itemKey)))
  const leaving = {
    count: inLeaving.length,
    bytes: String(inLeaving.reduce((sum, row) => sum + row.sizeBytes, 0n)),
    turnedOnAt: rule.turnedOnAt?.toISOString() ?? null,
    nextLeaveOn: next?.day ?? null,
    nextCount: next?.count ?? 0,
  }
  if (rule.mode === "reviewFirst") {
    const dueOn = batch?.dueSince ?? today
    const waiting = batch ? { count: batch.count, bytes: batch.bytes.toString(), dueOn, dueToday: dueOn === today } : null
    return { matches, dryRuns, leaving, waiting, deleted: null }
  }
  const since = rule.turnedOnAt
  const deleted = input.deleted.filter((outcome) => !since || outcome.actedAt >= since)
  return {
    matches, dryRuns, leaving, waiting: null,
    deleted: { count: deleted.length, bytes: String(deleted.reduce((sum, o) => sum + o.freedBytes, 0n)), since: since ? day(since, zone) : null },
  }
}
