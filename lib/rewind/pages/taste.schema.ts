import { z } from "zod"

/**
 * 07 Taste: the minutes of each genre the column prints (the names and
 * shares are the `taste.genre[n].*` facts, in the same order), and the
 * decades the member's titles were made in, for the decade strip. The
 * median year and the month strip are facts (`taste.medianYear`,
 * `taste.genreByMonth[m]`).
 */
export const TasteDataSchema = z.strictObject({
  genres: z
    .array(z.strictObject({ minutes: z.number().int().nonnegative() }))
    .min(1)
    .max(5),
  decades: z
    .array(z.strictObject({ decade: z.number().int().multipleOf(10), titles: z.number().int().positive() }))
    .max(20),
})

export type TasteData = z.infer<typeof TasteDataSchema>
