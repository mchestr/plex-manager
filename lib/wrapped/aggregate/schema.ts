/**
 * The strict schema of `RewindServerAggregate.data` (design 7.4).
 *
 * Every object is strict, so a field nobody declared (a name, an email, a
 * Tautulli row) fails the parse instead of being stored. Members are internal
 * user ids or null for unmatched Tautulli users; titles carry rating keys and
 * minutes, never who watched. A fact derived from members is null below
 * {@link MIN_CONTRIBUTORS}.
 *
 * @module lib/wrapped/aggregate/schema
 */

import { z } from "zod"

/** A community fact needs this many distinct contributors, or it is null. */
export const MIN_CONTRIBUTORS = 3

const count = z.number().int().nonnegative()
const contributors = z.number().int().min(MIN_CONTRIBUTORS)
const IsoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/** `film:<ratingKey>` or `series:<grandparentRatingKey>`. */
const TitleKey = z.string().regex(/^(film|series):\d+$/)

export const serverAggregateSchema = z.strictObject({
  version: z.literal(1),
  year: z.number().int(),
  through: IsoDate,
  finalCut: z.boolean(),
  serverZone: z.string(),
  /** One entry per matched member (`userId`) and per unmatched Tautulli user with plays (`null`). */
  members: z.array(z.strictObject({ userId: z.string().nullable(), minutes: count })),
  /** Titles with at least {@link MIN_CONTRIBUTORS} viewers: minutes per viewer, highest first. */
  titles: z.record(TitleKey, z.strictObject({ viewers: contributors, minutes: z.array(count) })),
  community: z.strictObject({
    hours: z.strictObject({ value: count, contributors }).nullable(),
    topSeries: z
      .strictObject({ grandparentRatingKey: z.string(), title: z.string(), minutes: count, contributors })
      .nullable(),
    busiestNight: z.strictObject({ day: IsoDate, minutes: count, contributors }).nullable(),
    peakConcurrent: z.strictObject({ value: contributors, at: z.number().int(), contributors }).nullable(),
    requestsFulfilled: z.strictObject({ value: count, contributors }).nullable(),
    titlesAdded: z.strictObject({ total: count, films: count, series: count }),
  }),
  /** Filled by P2.9's scorers. */
  archetypeCounts: z.record(z.string(), count).nullable(),
  /** Filled by P2.9. */
  medians: z.record(z.string(), z.number()).nullable(),
})

export type ServerAggregate = z.infer<typeof serverAggregateSchema>
export type CommunityFacts = ServerAggregate["community"]
