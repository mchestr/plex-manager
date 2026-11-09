import { z } from "zod"

/** The admin's inactivity sweep settings: the switch and the days without a play. */
export const inactivitySettingsSchema = z.object({
  enabled: z.boolean(),
  /** Days without a play (or since joining) before a member counts as inactive. */
  thresholdDays: z.number().int().min(30).max(3650),
})

/** The most leads the warning emails take: one email for each. */
export const MAX_WARNING_LEADS = 4

/** The most days before removal that any warning goes out. */
export const MAX_LEAD_DAYS = 90

/**
 * The largest lead a threshold allows: half of it, rounded down. A longer
 * lead could warn a member on the day of their last play.
 *
 * @example
 * ```ts
 * maxWarningLead(180) // 90
 * maxWarningLead(45)  // 22
 * ```
 */
export function maxWarningLead(thresholdDays: number): number {
  return Math.floor(thresholdDays / 2)
}

/**
 * The warning email switch and the days before removal that a warning goes
 * out: 1 to {@link MAX_WARNING_LEADS} different whole days from 1 to
 * {@link MAX_LEAD_DAYS}, saved largest first. The action also checks the
 * largest against {@link maxWarningLead} of the saved threshold.
 */
export const inactivityWarningsSchema = z.object({
  warningsEnabled: z.boolean(),
  warningDays: z
    .array(z.number().int().min(1).max(MAX_LEAD_DAYS, { message: `Use at most ${MAX_LEAD_DAYS} days before removal` }))
    .min(1)
    .max(MAX_WARNING_LEADS)
    .refine((days) => new Set(days).size === days.length, { message: "Use each number of days once" })
    .transform((days) => [...days].sort((a, b) => b - a)),
})
