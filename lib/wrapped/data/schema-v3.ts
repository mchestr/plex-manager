/**
 * The stored v3 Rewind (`PlexWrapped.data` with `version: 3`), design 7.9.
 *
 * Every object is strict, so a key this schema does not list fails the parse
 * instead of being stored or rendered unchecked. Page `data` stays `unknown`
 * here: each page is validated by its registry schema on read, and a page
 * that fails is dropped from the viewer, never crashing it (RWV-12, RWP-21).
 *
 * Fact ids are the catalogue's closed union, the archetype result is
 * `selectArchetype`'s and poster lines are the catalogue's sixty ids (P2.9).
 *
 * @module lib/wrapped/data/schema-v3
 */

import { z } from "zod"

import { ARCHETYPE_IDS } from "@/lib/wrapped/archetypes/catalogue"
import { RewindCopyV3Wire } from "@/lib/wrapped/copy/schema"
import { PageTypeSchema } from "@/lib/wrapped/data/page-types"
import { FactIdSchema, RewindFactsV3Schema } from "@/lib/wrapped/facts/catalogue"

const IsoDate = z.iso.date()
const IsoDateTime = z.iso.datetime({ offset: true })

const ArchetypeIdEnum = z.enum(ARCHETYPE_IDS)

/** `selectArchetype`'s result: code's pick, its evidence and rarity. */
const ArchetypeResult = z.strictObject({
  id: ArchetypeIdEnum,
  runnerUp: ArchetypeIdEnum.nullable(),
  evidence: z.array(FactIdSchema),
  shortlist: z.array(z.strictObject({ id: ArchetypeIdEnum, score: z.number().min(0).max(100) })).max(3),
  llmMayChoose: z.boolean(),
  rarity: z.strictObject({ count: z.number().int().nonnegative(), of: z.number().int().positive() }).nullable(),
})

export const RewindDataV3 = z.strictObject({
  version: z.literal(3),
  year: z.number().int(),
  statsVersion: z.string(), // e.g. 'stats-2026.1'
  generatedAt: IsoDateTime,
  window: z.strictObject({ from: IsoDate, through: IsoDate, zone: z.string(), finalCut: z.boolean() }),
  edition: z.enum(["full", "pocket", "postcard"]),
  facts: RewindFactsV3Schema,
  pages: z.array(z.strictObject({ type: PageTypeSchema, data: z.unknown() })),
  archetype: ArchetypeResult.nullable(),
  copy: RewindCopyV3Wire.nullable(), // null for pocket and postcard
  copySource: z.enum(["llm", "repair", "template", "mixed"]),
  copyMeta: z.strictObject({
    model: z.string().nullable(),
    promptVersion: z.string(),
    slotHashes: z.record(z.string(), z.string()),
  }),
  factsHash: z.string(), // sha256 of the canonical facts JSON
})

export type RewindDataV3 = z.infer<typeof RewindDataV3>
