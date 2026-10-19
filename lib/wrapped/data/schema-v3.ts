/**
 * The stored v3 Rewind (`PlexWrapped.data` with `version: 3`), design 7.9.
 *
 * Every object is strict, so a key this schema does not list fails the parse
 * instead of being stored or rendered unchecked. Page `data` stays `unknown`
 * here: each page is validated by its registry schema on read, and a page
 * that fails is dropped from the viewer, never crashing it (RWV-12, RWP-21).
 *
 * Provisional until the modules that own them merge: `FactId` (P2.9's
 * catalogue union), the archetype result (P2.9's scorers) and the poster line
 * ids (P5's copy slots).
 *
 * @module lib/wrapped/data/schema-v3
 */

import { z } from "zod"

import { PageTypeSchema } from "@/lib/wrapped/data/page-types"
import { ARCHETYPES, type ArchetypeId } from "@/lib/wrapped/llm-output-schema"

const IsoDate = z.iso.date()
const IsoDateTime = z.iso.datetime({ offset: true })

/** Provisional: becomes the catalogue's union of fact ids in P2.9. */
const FactId = z.string()

const ArchetypeIdEnum = z.enum(ARCHETYPES.map((archetype) => archetype.id) as [ArchetypeId, ...ArchetypeId[]])

/** Display strings plus raw values; a member never has every fact. */
const RewindFactsV3 = z.partialRecord(
  FactId,
  z.strictObject({
    value: z.union([z.number(), z.string(), z.null()]),
    display: z.string(),
    unit: z.string(),
  })
)

const ArchetypeResult = z.strictObject({
  id: ArchetypeIdEnum,
  runnerUp: ArchetypeIdEnum.nullable(),
  evidence: z.array(FactId),
})

const Slot = z.string().nullable()

const RewindCopyV3 = z.strictObject({
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
  archetype: z.strictObject({
    id: ArchetypeIdEnum,
    tagline: z.string(),
    dedication: z.string(),
    posterLineId: z.string(),
  }),
  signOff: Slot,
})

export const RewindDataV3 = z.strictObject({
  version: z.literal(3),
  year: z.number().int(),
  statsVersion: z.string(), // e.g. 'stats-2026.1'
  generatedAt: IsoDateTime,
  window: z.strictObject({ from: IsoDate, through: IsoDate, zone: z.string(), finalCut: z.boolean() }),
  edition: z.enum(["full", "pocket", "postcard"]),
  facts: RewindFactsV3,
  pages: z.array(z.strictObject({ type: PageTypeSchema, data: z.unknown() })),
  archetype: ArchetypeResult.nullable(),
  copy: RewindCopyV3.nullable(), // null for pocket and postcard
  copySource: z.enum(["llm", "repair", "template", "mixed"]),
  copyMeta: z.strictObject({
    model: z.string().nullable(),
    promptVersion: z.string(),
    slotHashes: z.record(z.string(), z.string()),
  }),
  factsHash: z.string(), // sha256 of the canonical facts JSON
})

export type RewindDataV3 = z.infer<typeof RewindDataV3>
