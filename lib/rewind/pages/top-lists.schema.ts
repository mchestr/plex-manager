import { z } from "zod"

import { TitleKeySchema } from "./title-key.schema"

/** Minutes in each calendar month, January first: a row's small multiple. */
const MonthlySchema = z.array(z.number().int().nonnegative()).length(12)

/**
 * 05 Top shows: one row per listed series, No. 1 first. Row n's numbers are
 * the `series[n].*` facts; the row holds its key (list key and poster) and
 * its monthly minutes, the geometry of the small multiple.
 *
 * `more` is every listed series past the five, with the title, minutes and
 * episodes no fact carries, for the desktop Notes' full table (P7.4). It is
 * absent on issues stored before it and with five series or fewer.
 */
export const TopShowsDataSchema = z.strictObject({
  rows: z
    .array(z.strictObject({ key: TitleKeySchema, monthly: MonthlySchema }))
    .min(1)
    .max(5),
  more: z
    .array(
      z.strictObject({
        key: TitleKeySchema,
        title: z.string().min(1),
        minutes: z.number().int().nonnegative(),
        episodes: z.number().int().nonnegative(),
      })
    )
    .min(1)
    .max(1000)
    .optional(),
})

/** 06 Top films: one row per listed film, ranked by plays; row n's numbers are the `films[n].*` facts. */
export const TopFilmsDataSchema = z.strictObject({
  rows: z
    .array(z.strictObject({ key: TitleKeySchema }))
    .min(1)
    .max(5),
})

export type TopShowsData = z.infer<typeof TopShowsDataSchema>
export type TopFilmsData = z.infer<typeof TopFilmsDataSchema>
