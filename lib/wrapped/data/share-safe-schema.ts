/**
 * The shapes of the share-safe projection (design 6.1): the options a card
 * or a link is rendered with, the context the projection reads at the time
 * it runs, and the strict `ShareSafeRewindV3` it produces.
 *
 * Client-safe: no server imports, so the share sheet (P5.11) validates its
 * options with the same schema.
 *
 * @module lib/wrapped/data/share-safe-schema
 */

import { z } from "zod"

import { RECORD_CELLS } from "@/lib/rewind/pages/records.schema"
import { SHARE_PAGE_TYPES } from "@/lib/rewind/registry"
import { ARCHETYPE_IDS } from "@/lib/wrapped/archetypes/catalogue"
import { FactIdSchema } from "@/lib/wrapped/facts/catalogue"

/** A page a card can print, and so a link can publish. */
export const SharePageTypeSchema = z.enum(SHARE_PAGE_TYPES)
export type SharePageType = z.infer<typeof SharePageTypeSchema>

/**
 * The stats a member may put on the centrefold and back cover (design 6.3,
 * "Three stats on the poster"), as the facts that print them.
 */
export const CARD_FACT_IDS = [
  "time.totalHours",
  "time.seriesHours",
  "counts.films",
  "counts.episodes",
  "standing.percentile",
  "hours.peak",
  "streak.longest.days",
  "archetype.rarityShare",
  "taste.genre[1].name",
  "records.completionShare",
] as const
export const CardFactIdSchema = z.enum(CARD_FACT_IDS)
export type CardFactId = z.infer<typeof CardFactIdSchema>

/** A share's asset key: 16 random bytes as 22 base64url characters. Card and poster URLs carry it, never the token. */
export const assetKeySchema = z.string().regex(/^[A-Za-z0-9_-]{22}$/, "Invalid asset key")

/** What a card or a link publishes; the same shape from the share sheet and from a stored `RewindShare`. */
export const ShareOptions = z.strictObject({
  pages: z.array(SharePageTypeSchema).min(1).max(SHARE_PAGE_TYPES.length),
  signed: z.boolean(),
  includeArt: z.boolean(),
  dailyDetail: z.boolean(),
  cardFacts: z.array(CardFactIdSchema).max(3),
})
export type ShareOptions = z.infer<typeof ShareOptions>

/** What the projection reads besides the stored Rewind; `loadShareContext` builds it at projection time. */
export interface ShareContext {
  /** Picks the template poster line; never published. */
  userId: string
  /** The brand cards print, or null when none is set. */
  serverName: string | null
  /** `Config.rewindShowServerNameOnCards`. */
  showServerName: boolean
  /** `Config.rewindPublicCounts`: counts that reveal the server's size may print. */
  publicCounts: boolean
  /** `Config.rewindAllowArtOnCards`. */
  allowArt: boolean
  /** Rating keys of the titles the member hid (`RewindExclusion`). */
  hiddenKeys: ReadonlySet<string>
  /** `RewindPrefs.exclusionsVersion`, part of the card cache key. */
  exclusionsVersion: number
}

const IsoDate = z.iso.date()
const RatingKey = z.string().regex(/^\d{1,12}$/)

const RecordCell = z.enum(RECORD_CELLS)

/**
 * What a card's graphic draws that no fact holds (P7.6), from the page's own
 * stored data and never a number a fact displays: `bars` are lengths against
 * the longest (Taste's genre column, the race's final standings, in the
 * order of the page's runners); `records` are the box's cells and the cell
 * the "record" stamp marks, which exists only with server medians; `titles`
 * are the postcard's titles 3 or more members watched, with no counts.
 */
export const ShareGraphic = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("bars"), bars: z.array(z.number().min(0).max(1)).max(5) }),
  z.strictObject({ kind: z.literal("records"), cells: z.array(RecordCell).max(4), stamp: RecordCell.nullable() }),
  z.strictObject({ kind: z.literal("titles"), titles: z.array(z.string().max(200)).max(3) }),
])
export type ShareGraphic = z.infer<typeof ShareGraphic>

/**
 * One published page. `headline` is the page's card headline rendered from
 * this page's own published facts (a template, never model text), or its
 * title-free line when it would need anything else.
 */
export const ShareSafePage = z.strictObject({
  type: SharePageTypeSchema,
  headline: z.string().max(200),
  facts: z.partialRecord(FactIdSchema, z.strictObject({ display: z.string().max(80) })),
  titles: z.array(z.string().max(200)).max(5),
  /** The title fact each of `titles` prints, in the same order, so a card can pair a title with its row's facts. */
  titleIds: z.array(FactIdSchema).max(5),
  art: z.array(z.strictObject({ ratingKey: RatingKey })).max(4).nullable(),
  soundtrack: z
    .strictObject({ grain: z.enum(["weekly", "daily"]), bins: z.array(z.number().min(0).max(1)).max(366) })
    .nullable(),
  archetype: z.strictObject({ id: z.enum(ARCHETYPE_IDS), name: z.string().max(60), posterLine: z.string().max(120) }).nullable(),
  /** Plays by start hour, normalised to the busiest (the clock and the centrefold's evidence clock), else null. */
  hours: z.array(z.number().min(0).max(1)).length(24).nullable(),
  /** The poster's three stats (centrefold and back cover): `cardFacts`, else the defaults, as printed facts. */
  stats: z.array(CardFactIdSchema).max(3),
  /** Only on pages whose card draws one (Taste, The race, Records). */
  graphic: ShareGraphic.optional(),
})
export type ShareSafePage = z.infer<typeof ShareSafePage>

export const ShareSafeRewindV3 = z.strictObject({
  version: z.literal(3),
  year: z.number().int(),
  brand: z.string().max(60).nullable(),
  ownerName: z.string().max(24).nullable(),
  serial: z.string().regex(/^[0-9A-HJKMNP-TV-Z]{4}$/).nullable(),
  edition: z.enum(["full", "pocket", "postcard"]),
  window: z.strictObject({ from: IsoDate, through: IsoDate, finalCut: z.boolean() }),
  pages: z.array(ShareSafePage),
  ogText: z.string().max(200),
})
export type ShareSafeRewindV3 = z.infer<typeof ShareSafeRewindV3>
