/**
 * The Rewind copy the model returns (design 8.3), in two strengths.
 *
 * `RewindCopyV3Wire` is what goes to the provider as the structured-output
 * schema: strings, enums and `nullable`, strict objects
 * (`additionalProperties: false`) and no length keywords, which Claude's
 * structured outputs do not accept. It is also the stored shape.
 *
 * `RewindCopyV3` is applied after parsing: each slot's raw text is capped
 * (a runaway guard; grounding rule 7 checks the rendered length against
 * `maxChars`), and the poster line must be one of the chosen archetype's five.
 *
 * @module lib/wrapped/copy/schema
 */

import { z } from "zod"

import { ARCHETYPE_IDS, POSTER_LINE_IDS, posterLineIds } from "@/lib/wrapped/archetypes/catalogue"

import { COPY_SLOTS, type SlotId } from "./slots"

const Slot = z.string().nullable()
const ArchetypeIdEnum = z.enum(ARCHETYPE_IDS)
const PosterLineIdEnum = z.enum(POSTER_LINE_IDS)

export const RewindCopyV3Wire = z.strictObject({
  decks: z.strictObject({
    number: Slot,
    bookends: Slot,
    topShows: Slot,
    topFilms: Slot,
    taste: Slot,
    people: Slot,
    clock: Slot,
    calendar: Slot,
    records: Slot,
    requests: Slot,
    standing: Slot,
    nextYear: Slot,
  }),
  archetype: z.strictObject({ id: ArchetypeIdEnum, tagline: z.string(), dedication: z.string(), posterLineId: PosterLineIdEnum }),
  signOff: Slot,
})

export type RewindCopyV3Wire = z.infer<typeof RewindCopyV3Wire>

/** Raw text may run longer than it renders (a token's id against its display), but never this long. */
const RAW_FACTOR = 3
const raw = (id: SlotId) => z.string().max(COPY_SLOTS[id].maxChars * RAW_FACTOR)
const deck = (id: SlotId) => raw(id).nullable()

export const RewindCopyV3 = z
  .strictObject({
    decks: z.strictObject({
      number: deck("deck.number"),
      bookends: deck("deck.bookends"),
      topShows: deck("deck.topShows"),
      topFilms: deck("deck.topFilms"),
      taste: deck("deck.taste"),
      people: deck("deck.people"),
      clock: deck("deck.clock"),
      calendar: deck("deck.calendar"),
      records: deck("deck.records"),
      requests: deck("deck.requests"),
      standing: deck("deck.standing"),
      nextYear: deck("deck.nextYear"),
    }),
    archetype: z.strictObject({
      id: ArchetypeIdEnum,
      tagline: raw("archetype.tagline").min(1),
      dedication: raw("archetype.dedication").min(1),
      posterLineId: PosterLineIdEnum,
    }),
    signOff: deck("signOff"),
  })
  .refine((copy) => posterLineIds(copy.archetype.id).includes(copy.archetype.posterLineId), {
    message: "The poster line belongs to another archetype",
    path: ["archetype", "posterLineId"],
  })

export type RewindCopyV3 = z.infer<typeof RewindCopyV3>
