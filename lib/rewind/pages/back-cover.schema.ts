import { z } from "zod"

import { DailyMinutesSchema } from "./cover.schema"

/** 18 Back cover: the soundtrack. The billing block reads facts and the selected list at render. */
export const BackCoverDataSchema = z.strictObject({ minutes: DailyMinutesSchema })

export type BackCoverData = z.infer<typeof BackCoverDataSchema>
