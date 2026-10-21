import { z } from "zod"

import { TitleKeySchema } from "./title-key.schema"

/**
 * The postcard: up to three titles that 3 or more members watched this year,
 * by viewer count, with their library display titles. No counts and no
 * names: the member's own total is the `time.totalMinutes` fact.
 */
export const PostcardDataSchema = z.strictObject({
  titles: z.array(z.strictObject({ key: TitleKeySchema, title: z.string().min(1) })).max(3),
})

export type PostcardData = z.infer<typeof PostcardDataSchema>
