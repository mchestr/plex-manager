import { z } from "zod"

import { TitleKeySchema } from "./title-key.schema"

const Minutes = z.number().int().nonnegative()

/**
 * 11 The race: the runners (the member's top series in final standing
 * order, with their keys and display titles) and one frame per month of the
 * window (11 during the season, 12 in a whole-year issue): each runner's
 * cumulative minutes at the month's end and the month's leader. P8.3's
 * scrubber reads only these stored frames, so no member is regenerated for
 * it under the freeze.
 */
export const RaceDataSchema = z
  .strictObject({
    series: z
      .array(z.strictObject({ key: TitleKeySchema, title: z.string().min(1) }))
      .min(3)
      .max(5),
    frames: z
      .array(
        z.strictObject({
          month: z.number().int().min(1).max(12),
          minutes: z.array(Minutes).min(3).max(5),
          /** The leader's index in `series`; null before anyone has started. */
          leader: z.number().int().min(0).max(4).nullable(),
        })
      )
      .min(3)
      .max(12),
  })
  .refine((data) => data.frames.every((f) => f.minutes.length === data.series.length && (f.leader === null || f.leader < data.series.length)), {
    message: "Every frame has one entry per runner",
    path: ["frames"],
  })
  .refine(
    (data) => data.frames.every((f, m) => m === 0 || (f.month > data.frames[m - 1].month && f.minutes.every((n, i) => n >= data.frames[m - 1].minutes[i]))),
    { message: "Months run in order and cumulative minutes never shrink", path: ["frames"] }
  )

export type RaceData = z.infer<typeof RaceDataSchema>
