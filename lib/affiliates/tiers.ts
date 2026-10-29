/**
 * Affiliate tiers: how many invites an approved affiliate may make per rolling
 * 30 days, from their all-time watch hours. Pure and client-safe.
 *
 * ## Tiers
 *
 * A tier applies when the hours are *more than* its `overHours` (strict, like
 * the request tiers). Unlike the request tiers, the first tier starts above 0
 * hours, and below it the allowance is 0:
 *
 * | Tier | Watch time | Invites per 30 days |
 * |---|---|---|
 * | - | 50 h or less | 0 |
 * | 1 | more than 50 h | 1 |
 * | 2 | more than 200 h | 2 |
 * | 3 | more than 500 h | 3 |
 *
 * An admin override (`AffiliateApplication.inviteOverride`, 0 to 10) replaces
 * the tier; 0 pauses the affiliate without a revoke.
 *
 * @module lib/affiliates/tiers
 */

import { z } from "zod"

export interface AffiliateTier {
  /** The tier applies when all-time watch time is more than this many hours. */
  overHours: number
  /** Invites per rolling 30 days. */
  invites: number
}

export const MAX_AFFILIATE_TIERS = 5
export const MAX_AFFILIATE_INVITES = 10

export const DEFAULT_AFFILIATE_TIERS: readonly AffiliateTier[] = [
  { overHours: 50, invites: 1 },
  { overHours: 200, invites: 2 },
  { overHours: 500, invites: 3 },
]

const tierSchema = z.object({
  overHours: z.number().gt(0).max(100_000),
  invites: z.number().int().min(1).max(MAX_AFFILIATE_INVITES),
})

/** The tier table: 1 to 5 tiers, each with more hours than the one before. */
export const affiliateTiersSchema = z
  .array(tierSchema)
  .min(1)
  .max(MAX_AFFILIATE_TIERS)
  .superRefine((tiers, ctx) => {
    tiers.forEach((tier, index) => {
      if (index > 0 && tier.overHours <= tiers[index - 1]!.overHours) {
        ctx.addIssue({ code: "custom", path: [index, "overHours"], message: "Each tier needs more hours than the one before" })
      }
    })
  })

/** The override an admin may set: 0 to 10 invites, or null for the tiers. */
export const inviteOverrideSchema = z.number().int().min(0).max(MAX_AFFILIATE_INVITES).nullable()

/** The stored table (`Config.affiliateTiers`), or the defaults while none is stored or it no longer validates. */
export function affiliateTiersFromConfig(stored: unknown): readonly AffiliateTier[] {
  const parsed = affiliateTiersSchema.safeParse(stored)
  return parsed.success ? parsed.data : DEFAULT_AFFILIATE_TIERS
}

/** The index of the highest tier the hours are over, or -1 below the first. */
export function affiliateTierIndex(hours: number, tiers: readonly AffiliateTier[]): number {
  let index = -1
  tiers.forEach((tier, i) => {
    if (hours > tier.overHours) index = i
  })
  return index
}

export interface Allowance {
  invites: number
  source: "tier" | "override"
}

/** Invites per 30 days: the override when set, else the tier for the hours (0 below the first). */
export function affiliateAllowance(hours: number, override: number | null, tiers: readonly AffiliateTier[]): Allowance {
  if (override !== null) return { invites: override, source: "override" }
  const index = affiliateTierIndex(hours, tiers)
  return { invites: index < 0 ? 0 : tiers[index]!.invites, source: "tier" }
}
