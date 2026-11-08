/**
 * The facts that a check saw (TS 3.4), stored in `CleanupItem.why` and
 * `CleanupOutcome.why`. No member ids and no names: each requester is only
 * `member`, `former`, `owner` or `unknown`. Client-safe.
 *
 * @module lib/cleanup/schema/why
 */

import { z } from "zod"

import { issuePaths, logParseDropped, matchStateSchema, sourceStatusSchema } from "@/lib/cleanup/schema/snapshot"
import { FIELD_IDS } from "@/lib/validations/cleanup-vocabulary"

const epoch = z.number().int().nonnegative() // Unix seconds

export const REQUESTER_KINDS = ["member", "former", "owner", "unknown"] as const

export const whySnapshotSchema = z.object({
  v: z.literal(1),
  snapshotId: z.string(), takenAt: z.iso.datetime(), checkedAt: z.iso.datetime(),
  ruleId: z.string(), // the rule whose verdicts are stored (the first holding rule)
  conditions: z.array(z.object({ id: z.string(), field: z.enum(FIELD_IDS), verdict: z.enum(["pass", "fail", "unknown"]), cause: z.string().optional() })),
  protections: z.array(z.object({ id: z.string(), verdict: z.enum(["clear", "protects", "unknown"]) })),
  facts: z.object({
    lastCountedAt: epoch.nullable(), countedTotal: z.number().int().nullable(),
    addedPlex: epoch.nullable(), addedArr: epoch.nullable(), sizeBytes: z.number().int().nullable(),
    requests: z.array(z.object({ at: epoch, requester: z.enum(REQUESTER_KINDS) })),
    importList: z.boolean(),
    showStatus: z.string().nullable(), seasonsOnDisk: z.number().int().nullable(), position: z.number().int().nullable(), lastEpisodeAddedAt: epoch.nullable(),
    historyStartAt: epoch.nullable(),
  }),
  match: z.object({ state: matchStateSchema, by: z.enum(["tmdb", "tvdb", "imdb"]).optional(), externalId: z.string().optional(),
    service: z.enum(["radarr", "sonarr"]).optional(), arrId: z.number().int().optional(), path: z.string().optional() }),
  sources: z.array(sourceStatusSchema),
})
export type WhySnapshot = z.infer<typeof whySnapshotSchema>

/** A stored Why, or null when it is missing or does not parse (logged by issue path). Never throws. */
export function parseWhy(raw: unknown): WhySnapshot | null {
  if (raw === null || raw === undefined) return null
  const parsed = whySnapshotSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  logParseDropped("why", 1, issuePaths(parsed.error))
  return null
}
