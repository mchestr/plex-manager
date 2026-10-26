/**
 * Request-limit tiers: how much a member has watched decides how many movies
 * and shows they may request from Overseerr each period.
 *
 * ## Tiers
 *
 * A tier applies when the member's all-time watch time is *more than* its
 * `overHours`. The first tier has `overHours: 0` and applies to everyone, so a
 * member with exactly the next tier's threshold stays in the lower tier:
 *
 * | Tier | Watch time | Movies | Shows | Period |
 * |---|---|---|---|---|
 * | 1 | any | 2 | 1 | 7 days |
 * | 2 | more than 24 h | 4 | 2 | 7 days |
 * | 3 | more than 50 h | 6 | 3 | 7 days |
 * | 4 | more than 100 h | 10 | 5 | 7 days |
 * | 5 | more than 200 h | unlimited (`0`) | unlimited (`0`) | 7 days |
 *
 * @module lib/request-tiers/tiers
 */

import { z } from "zod"

export interface RequestTier {
  /** The tier applies when watch time is more than this many hours. */
  overHours: number
  /** Requests per period; `0` is unlimited (Overseerr's convention). */
  movieLimit: number
  tvLimit: number
  /** The length of the period in days. */
  days: number
}

export const MAX_TIERS = 10

export const DEFAULT_TIERS: readonly RequestTier[] = [
  { overHours: 0, movieLimit: 2, tvLimit: 1, days: 7 },
  { overHours: 24, movieLimit: 4, tvLimit: 2, days: 7 },
  { overHours: 50, movieLimit: 6, tvLimit: 3, days: 7 },
  { overHours: 100, movieLimit: 10, tvLimit: 5, days: 7 },
  { overHours: 200, movieLimit: 0, tvLimit: 0, days: 7 },
]

const tierSchema = z.object({
  overHours: z.number().min(0).max(100_000),
  movieLimit: z.number().int().min(0).max(1000),
  tvLimit: z.number().int().min(0).max(1000),
  days: z.number().int().min(1).max(365),
})

/** The tier table: 1 to 10 tiers, the first at 0 hours, thresholds rising. */
export const requestTiersSchema = z
  .array(tierSchema)
  .min(1)
  .max(MAX_TIERS)
  .superRefine((tiers, ctx) => {
    if (tiers[0] && tiers[0].overHours !== 0) {
      ctx.addIssue({ code: "custom", path: [0, "overHours"], message: "The first tier starts at 0 hours" })
    }
    tiers.forEach((tier, index) => {
      if (index > 0 && tier.overHours <= tiers[index - 1]!.overHours) {
        ctx.addIssue({ code: "custom", path: [index, "overHours"], message: "Each tier needs more hours than the one before" })
      }
    })
  })

/** The stored tier table, or {@link DEFAULT_TIERS} while none is stored or it no longer validates. */
export function tiersFromConfig(stored: unknown): readonly RequestTier[] {
  const parsed = requestTiersSchema.safeParse(stored)
  return parsed.success ? parsed.data : DEFAULT_TIERS
}

/** The index of the highest tier whose threshold the watch time is over. */
export function tierIndexFor(hours: number, tiers: readonly RequestTier[]): number {
  let index = 0
  tiers.forEach((tier, i) => {
    if (hours > tier.overHours) index = i
  })
  return index
}

export interface TierProgress {
  index: number
  tier: RequestTier
  /** The next tier up, or null at the top. */
  next: RequestTier | null
  /** Hours still to watch for the next tier (never negative), null at the top. */
  hoursToNext: number | null
  /** 0 to 100 through the current tier's band; 100 at the top. */
  percent: number
}

/** Where a member stands: their tier, the next one and how far along they are. */
export function tierProgress(hours: number, tiers: readonly RequestTier[]): TierProgress {
  const index = tierIndexFor(hours, tiers)
  const tier = tiers[index]!
  const next = tiers[index + 1] ?? null
  if (!next) return { index, tier, next, hoursToNext: null, percent: 100 }
  const band = next.overHours - tier.overHours
  const percent = Math.min(100, Math.max(0, ((hours - tier.overHours) / band) * 100))
  return { index, tier, next, hoursToNext: Math.max(0, next.overHours - hours), percent }
}

/** "4 movies" or "unlimited movies"; a limit of 0 is unlimited. */
export function limitCopy(limit: number, noun: "movies" | "shows"): string {
  if (limit === 0) return `unlimited ${noun}`
  return `${limit} ${limit === 1 ? noun.slice(0, -1) : noun}`
}

/** "4", or "Unlimited" for 0, for a table cell. */
export function limitNumber(limit: number): string {
  return limit === 0 ? "Unlimited" : String(limit)
}
