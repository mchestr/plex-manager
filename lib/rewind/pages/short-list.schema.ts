import { z } from "zod"

import { TitleKeySchema } from "./title-key.schema"

/**
 * The pocket edition's Short list: the top 3 titles of any type, No. 1
 * first. A row is its title key and its rank in its own list, so its numbers
 * are the `series[rank].*` or `films[rank].*` facts (the key's prefix says
 * which).
 */
export const ShortListDataSchema = z.strictObject({
  rows: z
    .array(z.strictObject({ key: TitleKeySchema, rank: z.number().int().min(1).max(5) }))
    .min(1)
    .max(3),
})

export type ShortListData = z.infer<typeof ShortListDataSchema>
export type ShortListRow = ShortListData["rows"][number]
