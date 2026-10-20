import { z } from "zod"

import { TitleKeySchema } from "./title-key.schema"

/** One day of the window: its minutes, and the key of its top listed title (null when nothing listed was played). */
const DaySchema = z.strictObject({ minutes: z.number().int().nonnegative(), key: TitleKeySchema.nullable() })

/**
 * 10 The calendar: every day of the window in order from `window.from`, and
 * the display title of each top-title key (hidden titles were never ranked).
 * P8.3's "Pick a day" sheet reads only this, so a P1 feature never needs a
 * member regenerated under the freeze. The streak and the biggest day are facts.
 */
export const CalendarDataSchema = z
  .strictObject({
    days: z.array(DaySchema).max(366),
    titles: z.record(TitleKeySchema, z.string().min(1)),
    /** The longest gap's first and last unplayed days, for the dotted underline; its length is `days.longestGap.days`. */
    gap: z.strictObject({ from: z.iso.date(), to: z.iso.date() }).nullable(),
  })
  .refine((data) => data.days.every((day) => day.key === null || day.key in data.titles), {
    message: "Every day's top title is in the titles map",
    path: ["titles"],
  })

export type CalendarData = z.infer<typeof CalendarDataSchema>
