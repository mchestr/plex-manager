/**
 * A rule's evaluation record (TS 3.4): the newest evaluation and the dry-run
 * history in `CleanupRule.stats`, and the per-rule counts of a run in
 * `CleanupRun.entries`. Ids and counts only. Client-safe.
 *
 * @module lib/cleanup/schema/stats
 */

import { z } from "zod"

import { blockSchema } from "@/lib/cleanup/blocks"
import { issuePaths, logParseDropped, parseStoredRows } from "@/lib/cleanup/schema/snapshot"
import { MODES } from "@/lib/validations/cleanup-vocabulary"

/** The dry runs that a rule keeps (TS 2.7). */
export const DRY_RUNS_KEPT = 30

const lastEvalSchema = z.object({
  runId: z.string(), at: z.iso.datetime(), snapshotId: z.string(),
  checked: z.number().int(), matches: z.number().int(), bytes: z.number().int(), nearMisses: z.number().int(),
  protected: z.number().int(), missing: z.number().int(), cannotDelete: z.number().int(),
  largest: z.array(z.string()).max(5), // rating keys, largest first (rule card posters)
  overlaps: z.array(z.object({ ruleId: z.string(), count: z.number().int(), kind: z.enum(["same", "inShow", "hasSeasons"]) })),
  blocks: z.array(blockSchema),
})

const dryRunEntrySchema = z.object({
  at: z.iso.datetime(), runId: z.string(), snapshotId: z.string(), matches: z.number().int(), bytes: z.number().int(),
  definitionHash: z.string(), // first 16 hex of SHA-256 of stableJson(definition)
})
export type DryRunEntry = z.infer<typeof dryRunEntrySchema>

/** @internal Exported for the tests. */
export const ruleStatsSchema = z.object({
  v: z.literal(1).default(1),
  lastEval: lastEvalSchema.optional(),
  dryRuns: z.array(dryRunEntrySchema).max(DRY_RUNS_KEPT).default([]),
})
export type RuleStats = z.infer<typeof ruleStatsSchema>

/** @internal Exported for the tests. */
export const runRuleEntrySchema = z.object({
  ruleId: z.string(), mode: z.enum(MODES), matches: z.number().int(), joined: z.number().int(), held: z.number().int(),
  rescued: z.number().int(), deleted: z.number().int(), failed: z.number().int(), blocks: z.array(blockSchema),
})
export type RunRuleEntry = z.infer<typeof runRuleEntrySchema>

const isRecord = (value: unknown): value is Record<string, unknown> =>
  value !== null && typeof value === "object" && !Array.isArray(value)

/**
 * A stored `CleanupRule.stats`. Never throws. A bad `lastEval` drops alone, and
 * a bad dry-run entry drops alone (both logged by issue path). The dry runs
 * come back oldest first, at most the newest 30.
 */
export function parseRuleStats(raw: unknown): RuleStats {
  const stored = isRecord(raw) ? raw : {}
  if (raw !== undefined && raw !== null && !isRecord(raw)) logParseDropped("ruleStats", 1, ["(root)"])
  let lastEval: RuleStats["lastEval"]
  if (stored.lastEval !== undefined) {
    const parsed = lastEvalSchema.safeParse(stored.lastEval)
    if (parsed.success) lastEval = parsed.data
    else logParseDropped("ruleStats", 1, issuePaths(parsed.error, ["lastEval"]))
  }
  const dryRuns = parseStoredRows("ruleStats.dryRuns", dryRunEntrySchema, stored.dryRuns)
    .rows.sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0))
    .slice(-DRY_RUNS_KEPT)
  return lastEval ? { v: 1, lastEval, dryRuns } : { v: 1, dryRuns }
}

/** A stored `CleanupRun.entries`. Never throws: bad entries are dropped and logged by issue path. @internal */
export function parseRunEntries(raw: unknown): RunRuleEntry[] {
  return parseStoredRows("runEntries", runRuleEntrySchema, raw).rows
}
