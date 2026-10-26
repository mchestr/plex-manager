/**
 * What a request-tier run records for each member (`RequestTierRun.entries`):
 * the watch time, the tier, and the quota before and after.
 *
 * @module lib/request-tiers/entries
 */

import { z } from "zod"

import { quotaCopy, type Quota } from "@/lib/request-tiers/quota"

const quotaSchema = z.object({
  movieQuotaLimit: z.number().nullable(),
  movieQuotaDays: z.number().nullable(),
  tvQuotaLimit: z.number().nullable(),
  tvQuotaDays: z.number().nullable(),
})

const requestTierEntrySchema = z.object({
  overseerrUserId: z.number(),
  name: z.string(),
  /** All-time watch time; null when Tautulli did not answer. */
  hours: z.number().nullable(),
  /** The tier number from 1; null when the hours are unknown. */
  tier: z.number().nullable(),
  status: z.enum(["updated", "unchanged", "failed", "excluded"]),
  oldQuota: quotaSchema,
  /** The quota the tier sets; null when the hours are unknown or the member is excluded. */
  newQuota: quotaSchema.nullable(),
})

export type RequestTierEntry = z.infer<typeof requestTierEntrySchema>

/** The entries of a stored run, dropping any row that no longer matches the shape. */
export function parseEntries(stored: unknown): RequestTierEntry[] {
  const rows = Array.isArray(stored) ? stored : []
  return rows.flatMap((row) => {
    const parsed = requestTierEntrySchema.safeParse(row)
    return parsed.success ? [parsed.data] : []
  })
}

const hoursCopy = (hours: number | null) => (hours === null ? "?" : hours.toFixed(1))

/** "Updated Sam (31.0h) -> Tier 2: 4 movies, 2 TV/week" */
export function summaryLine(entry: RequestTierEntry): string {
  const quota: Quota | null = entry.newQuota
  switch (entry.status) {
    case "updated":
    case "unchanged":
      return `${entry.status === "updated" ? "Updated" : "Unchanged"} ${entry.name} (${hoursCopy(entry.hours)}h) -> Tier ${entry.tier}: ${quota ? quotaCopy(quota) : ""}`
    case "excluded":
      return `Skipped ${entry.name} (excluded)`
    case "failed":
      return `Failed ${entry.name}${entry.hours === null ? "" : ` (${hoursCopy(entry.hours)}h)`}`
  }
}
