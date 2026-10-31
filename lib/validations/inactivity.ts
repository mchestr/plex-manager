import { z } from "zod"

/** The admin's inactivity sweep settings: the switch and the days without a play. */
export const inactivitySettingsSchema = z.object({
  enabled: z.boolean(),
  /** Days without a play (or since joining) before a member counts as inactive. */
  thresholdDays: z.number().int().min(30).max(3650),
})
