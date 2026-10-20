import { z } from "zod"

import { DailyMinutesSchema } from "./cover.schema"
import { TitleKeySchema } from "./title-key.schema"

/**
 * 18 Back cover: the soundtrack, and the keys of the titles the billing block
 * names (`series[1-3].title`, `films[1].title`), so a hidden title leaves the
 * card and its poster even when Top shows or Top films is not in the issue.
 * The billing block reads facts and the selected list at render.
 */
export const BackCoverDataSchema = z.strictObject({
  minutes: DailyMinutesSchema,
  keys: z.strictObject({ series: z.array(TitleKeySchema).max(3), film: TitleKeySchema.nullable() }),
})

export type BackCoverData = z.infer<typeof BackCoverDataSchema>
