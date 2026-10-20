import { z } from "zod"

/** Counted plays by start hour, 0-23: the ring's geometry input. */
export const HourHistogramSchema = z.array(z.number().int().nonnegative()).length(24)

/**
 * 09 The clock: counted plays by start hour, and the share of plays by start
 * weekday from Monday, for the weekday row. The peak, the after-dark share
 * and the zone are facts (`hours.*`, `tz.label`).
 */
export const ClockDataSchema = z.strictObject({
  hours: HourHistogramSchema,
  weekdays: z.array(z.number().min(0).max(1)).length(7),
})

export type ClockData = z.infer<typeof ClockDataSchema>
