import { z } from "zod"

import { DailyMinutesSchema } from "./cover.schema"

/**
 * 02 The number: which fact is the hero (whole hours from 10 hours up, else
 * the duration: "7 h 20 m", "47 minutes") and the daily minutes the road to
 * the total is drawn from.
 */
export const NumberDataSchema = z.strictObject({
  hero: z.enum(["time.totalHours", "time.totalMinutes"]),
  minutes: DailyMinutesSchema,
})

export type NumberData = z.infer<typeof NumberDataSchema>
