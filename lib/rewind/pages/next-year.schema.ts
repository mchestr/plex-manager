import { z } from "zod"

import { TitleKeySchema } from "./title-key.schema"

const DayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)
const Index = z.number().int().nonnegative()

/** The facts a pick's "Because you watched ..." line may name. */
export const PICK_REASONS = [
  "people.actor[1].name",
  "people.actor[2].name",
  "people.actor[3].name",
  "people.actor[4].name",
  "people.actor[5].name",
  "people.director[1].name",
  "people.director[2].name",
  "people.director[3].name",
  "taste.genre[1].name",
] as const

/**
 * 17 Next year: the three parts of the listings column, each row in fact
 * order (row n is `next.<part>[n].title`). Titles and dates are facts; the
 * rows hold the keys the links open and the numbers the listing sets in
 * tabular numerals.
 */
export const NextYearDataSchema = z.strictObject({
  leftForLater: z.array(z.strictObject({ key: TitleKeySchema, season: Index, episode: Index, lastWatched: DayKey })).max(3),
  returning: z.array(z.strictObject({ key: TitleKeySchema, season: Index, tmdbId: z.number().int().positive().nullable() })).max(3),
  picks: z.array(z.strictObject({ ratingKey: z.string().min(1).max(64), kind: z.enum(["film", "series"]), year: z.number().int().nullable(), because: z.enum(PICK_REASONS) })).max(3),
})

export type NextYearData = z.infer<typeof NextYearDataSchema>
