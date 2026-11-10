/**
 * The warnings of a preview (TS 6.7, UX 4.3.9), in the order of the card
 * (UX 4.3.6): wide, cannot match, zero, a failed source, stale data, then
 * the incomplete and not-applicable conditions. Pure and client-safe.
 *
 * @module lib/cleanup/preview/warnings
 */

import { STALE_DATA_HOURS, WIDE_RULE_PERCENT } from "@/lib/cleanup/constants"
import { findContradictions } from "@/lib/cleanup/engine/contradictions"
import type { RuleStatistics } from "@/lib/cleanup/engine/stats"
import type { CompiledRule, ItemResult } from "@/lib/cleanup/engine/types"
import { ruleSources } from "@/lib/cleanup/rule-blocks"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { PreviewWarning } from "@/lib/cleanup/types/preview"
import type { CleanupOptions } from "@/lib/validations/cleanup-options"

const HOUR_MS = 3_600_000

export interface WarningInput {
  compiled: CompiledRule
  results: readonly ItemResult[]
  stats: RuleStatistics
  options: CleanupOptions
  sources: readonly SourceStatus[]
  /** Epoch ms of the preview and of the snapshot's end. */
  now: number
  finishedAt: number
  /** The draft's conditions whose field does not apply to its level. */
  notApplicable: readonly string[]
}

/**
 * The zero warning (TS 6.7): the clause with the smallest pass count, and
 * the largest item that passes every other clause. The recipe step reads it
 * too (UX 4.2.2 item 6).
 */
export function zeroWarning({ compiled, results, stats }: Pick<WarningInput, "compiled" | "results" | "stats">): Extract<PreviewWarning, { kind: "zero" }> | null {
  if (stats.matches !== 0 || stats.checked === 0 || compiled.clauses.length === 0) return null
  let conditionId = compiled.clauses[0].id
  for (const clause of compiled.clauses) if (stats.passAlone[clause.id] < stats.passAlone[conditionId]) conditionId = clause.id
  let largest: number | null = null
  for (const result of results) {
    if (!result.clauses.every((c) => c.id === conditionId || c.verdict === "pass")) continue
    const size = result.item.sizeBytes
    if (size !== null && (largest === null || size > largest)) largest = size
  }
  return {
    kind: "zero",
    conditionId,
    leaves: stats.passAlone[conditionId],
    of: stats.checked,
    largestBytes: largest === null ? null : String(largest),
    nearMisses: stats.tabs.nearMisses,
  }
}

/** Every warning of the preview, in card order. */
export function previewWarnings(input: WarningInput): PreviewWarning[] {
  const { compiled, stats, options, sources } = input
  const warnings: PreviewWarning[] = []
  if (stats.checked > 0 && stats.matches * 100 > WIDE_RULE_PERCENT * stats.checked) {
    warnings.push({ kind: "wide", percent: Math.round((stats.matches * 100) / stats.checked), matches: stats.matches, checked: stats.checked })
  }
  for (const pair of findContradictions(compiled, options)) warnings.push({ kind: "cannotMatch", ...pair })
  const zero = zeroWarning(input)
  if (zero) warnings.push(zero)
  const used = new Set(ruleSources(compiled, options, sources))
  for (const status of sources) {
    if (status.state !== "failed" || !used.has(status.service)) continue
    if (warnings.some((w) => w.kind === "sourceFailed" && w.service === status.service)) continue
    warnings.push({ kind: "sourceFailed", service: status.service, readAt: status.readAt })
  }
  const age = input.now - input.finishedAt
  if (age > STALE_DATA_HOURS * HOUR_MS) warnings.push({ kind: "stale", hours: Math.floor(age / HOUR_MS) })
  if (compiled.incomplete.length > 0) warnings.push({ kind: "incomplete", conditionIds: [...compiled.incomplete] })
  if (input.notApplicable.length > 0) warnings.push({ kind: "notApplicable", conditionIds: [...input.notApplicable] })
  return warnings
}
