import { z } from "zod"

import { DailyMinutesSchema } from "./cover.schema"

/**
 * 02 The number: which fact is the hero (whole hours from 10 hours up, else
 * the duration: "7 h 20 m", "47 minutes") and the daily minutes the road to
 * the total is drawn from.
 *
 * `lastYearDaily` is last year's daily minutes over the same window, from the
 * lifetime pass (P7.4), stored so P8.4's Compare with last year and the page's
 * Notes need no regeneration. It is absent without last-year history.
 */
export const NumberDataSchema = z.strictObject({
  hero: z.enum(["time.totalHours", "time.totalMinutes"]),
  minutes: DailyMinutesSchema,
  lastYearDaily: DailyMinutesSchema.optional(),
})

export type NumberData = z.infer<typeof NumberDataSchema>
