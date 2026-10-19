/**
 * The shape of a Rewind golden fixture (`evals/rewind/fixtures/*.json`).
 *
 * A fixture is one synthetic member: their Tautulli rows (real field names,
 * parsed by the real source schemas through `fixture-source.ts`), their
 * lifetime rows before 2026, the metadata cache and Overseerr rows, and the
 * hand-checked expectations. `expected.stats` is asserted by
 * `__tests__/golden-stats.test.ts` (P2.10); `facts`, `edition`, `archetype`
 * and `omittedPages` by P2.16's golden-facts test.
 *
 * Hand values are authored in `profiles/*.ts` and never written by tooling;
 * `fixtures/README.md` says how each one was derived.
 *
 * @module evals/rewind/fixture-schema
 */

import { z } from "zod"

const row = z.record(z.string(), z.unknown())
const dayKey = z.string().regex(/^\d{4}-\d{2}-\d{2}$/)

/**
 * Hand-checked stats, one optional section per P2.7 module. A section lists
 * only the fields that were checked by hand; each listed field must equal the
 * module's output exactly (shares to 9 decimal places). `topSeries` and
 * `topFilms` are the head of `rankTitles` as `{ title, minutes, plays }`.
 */
const section = z.record(z.string(), z.unknown())
const expectedStatsSchema = z
  .object({
    totals: section,
    time: section,
    calendar: section,
    sessions: section,
    bookends: section,
    race: section,
    milestones: z.array(z.object({ hours: z.number(), date: dayKey })),
    topSeries: z.array(z.object({ title: z.string(), minutes: z.number(), plays: z.number() })),
    topFilms: z.array(z.object({ title: z.string(), minutes: z.number(), plays: z.number() })),
  })
  .partial()
  .strict()

/** Pages of the full issue (design 4.2), by number. */
const page = z.number().int().min(1).max(18)

export const fixtureSchema = z
  .object({
    id: z.string().regex(/^[a-z0-9-]+$/),
    description: z.string().min(1),
    member: z.object({
      /** What the member sees as their name (`User.name` unless `userName` is set). */
      displayName: z.string(),
      /** `User.name` when it differs from the display name, such as an email-like value. */
      userName: z.string().nullable(),
      /** The member's own zone; null means the server zone. */
      timezone: z.string().nullable(),
      /** Rating keys hidden from lists (`RewindExclusion.ratingKey`). */
      hiddenRatingKeys: z.array(z.string()),
    }),
    server: z.object({
      name: z.string(),
      zone: z.string(),
      overseerr: z.boolean(),
      /** Members with a 2026 Rewind, this one included, and the other members' hours. */
      peers: z.object({ members: z.number().int().min(1), hours: z.array(z.number()) }),
    }),
    window: z.object({ year: z.literal(2026), finalCut: z.boolean() }),
    history: z.array(row),
    lifetimeBefore2026: z.array(row),
    metadata: z.array(row),
    requests: z.object({ rows: z.array(row), genres: z.record(z.string(), z.array(z.string())) }).nullable(),
    expected: z.object({
      edition: z.enum(["full", "pocket", "postcard"]),
      archetype: z.string().nullable(),
      /** Full-issue pages whose own eligibility rule fails (design 4.3). */
      omittedPages: z.array(page),
      /** Fact id to hand-checked display string (design 7.8). */
      facts: z.record(z.string(), z.string()),
      stats: expectedStatsSchema,
    }),
  })
  .strict()

export type Fixture = z.infer<typeof fixtureSchema>
