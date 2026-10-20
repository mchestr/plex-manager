import { z } from "zod"

/** Minutes per day of the data window, in order: the soundtrack's geometry input. */
export const DailyMinutesSchema = z.array(z.number().int().nonnegative()).max(366)

/** 01 Cover: the soundtrack. Masthead, window and cover lines come from facts and the selected list. */
export const CoverDataSchema = z.strictObject({ minutes: DailyMinutesSchema })

export type CoverData = z.infer<typeof CoverDataSchema>
