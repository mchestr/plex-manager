import { z } from "zod"

import { ARCHETYPE_IDS } from "@/lib/wrapped/archetypes/catalogue"
import { FactIdSchema } from "@/lib/wrapped/facts/catalogue"

import { HourHistogramSchema } from "./clock.schema"
import { DailyMinutesSchema } from "./cover.schema"

const Hour = z.number().int().min(0).max(23)
const Ratio = z.number().min(0).max(1)

/**
 * The archetype's evidence graphic (design 5.3), with only its geometry
 * inputs: the numbers it labels are facts.
 *
 * - `hour-ring`: the arc's window and the share fact in the centre; the bars
 *   are the page's `hours`.
 * - `meter`: the fact it shows, the bar's ratio and the server median's.
 * - `calendar-dots`: whether played weekends are the solid dots.
 * - `shelf`: the title facts on the spines, each with its rewatch fact or null.
 */
const EvidenceGraphicSchema = z.discriminatedUnion("kind", [
  z.strictObject({ kind: z.literal("hour-ring"), arc: z.strictObject({ from: Hour, to: Hour }), share: FactIdSchema }),
  z.strictObject({ kind: z.literal("meter"), fact: FactIdSchema, ratio: Ratio, median: Ratio.nullable() }),
  z.strictObject({ kind: z.literal("calendar-dots"), weekends: z.boolean(), minutes: DailyMinutesSchema }),
  z.strictObject({ kind: z.literal("shelf"), spines: z.array(z.strictObject({ title: FactIdSchema, mark: FactIdSchema.nullable() })).min(1).max(6) }),
])

export type EvidenceGraphic = z.infer<typeof EvidenceGraphicSchema>

/**
 * 16 Centrefold: the shortlist with each archetype's evidence fact ids (the
 * chosen one first) for "Why this?", the 24 hours for the Table, and the
 * evidence graphic, null when its fact is missing or there is no archetype.
 */
export const CentrefoldDataSchema = z.strictObject({
  shortlist: z.array(z.strictObject({ id: z.enum(ARCHETYPE_IDS), evidence: z.array(FactIdSchema).max(4) })).max(3),
  hours: HourHistogramSchema,
  graphic: EvidenceGraphicSchema.nullable(),
})

export type CentrefoldData = z.infer<typeof CentrefoldDataSchema>
