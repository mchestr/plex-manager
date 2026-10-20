/**
 * The twelve Rewind archetypes (design 5.3, 7.6): names and motifs, the
 * fixed tie-break order, the low-volume shortlist, each archetype's
 * colourway and evidence graphic, and its five poster-line ids (G11).
 *
 * Names and motifs are fixed in code, so a reveal is never off-brand or
 * empty. P5.8 writes the poster lines themselves; this module only fixes
 * their ids (`mm.1` to `mm.5` for the Midnight Marathoner), which the LLM
 * picks from and the grounding check enforces.
 *
 * @module lib/wrapped/archetypes/catalogue
 */

import type { InkName } from "@/lib/design/tokens"

/** Every archetype, in the v2 order the stored v2 rows and prompt use. */
export const ARCHETYPES = [
  { id: "midnight-marathoner", name: "The Midnight Marathoner", motif: "Watches deep into the night, one more episode always wins" },
  { id: "credits-roller", name: "The Credits Roller", motif: "Finishes what they start — every film watched to the last frame" },
  { id: "comfort-rewatcher", name: "The Comfort Rewatcher", motif: "Returns to beloved favorites again and again" },
  { id: "premiere-chaser", name: "The Premiere Chaser", motif: "First in line for new releases and fresh episodes" },
  { id: "series-devourer", name: "The Series Devourer", motif: "Consumes entire seasons in sittings, binges without mercy" },
  { id: "weekend-double-feature", name: "The Weekend Double Feature", motif: "Saves it all up for marathon weekend sessions" },
  { id: "curator", name: "The Curator", motif: "A carefully chosen catalog — quality over quantity" },
  { id: "explorer", name: "The Explorer", motif: "Always discovering something new, rarely repeats" },
  { id: "loyalist", name: "The Loyalist", motif: "Devoted to a handful of shows above all others" },
  { id: "golden-hour-viewer", name: "The Golden Hour Viewer", motif: "Reliable evening ritual, the same prime-time slot every day" },
  { id: "festival-juror", name: "The Festival Juror", motif: "Broad taste across films — a serious cinema diet" },
  { id: "casual-critic", name: "The Casual Critic", motif: "Drops in when something's worth it, watches on their own terms" },
] as const

export type ArchetypeId = (typeof ARCHETYPES)[number]["id"]

export const ARCHETYPE_IDS = ARCHETYPES.map((a) => a.id) as [ArchetypeId, ...ArchetypeId[]]

/**
 * The fixed tie-break order: on equal scores the earlier archetype wins. The
 * rarest habits come first and the most common shapes last (prime-time
 * viewing, a film-heavy diet, low volume), so a common pattern never hides a
 * distinctive one.
 */
export const TIE_BREAK_ORDER: readonly ArchetypeId[] = [
  "premiere-chaser",
  "credits-roller",
  "comfort-rewatcher",
  "midnight-marathoner",
  "loyalist",
  "series-devourer",
  "weekend-double-feature",
  "explorer",
  "festival-juror",
  "golden-hour-viewer",
  "curator",
  "casual-critic",
]

/** The only archetypes a light viewer (under 5 hours or 10 plays) may get. */
export const LOW_VOLUME_SHORTLIST: readonly ArchetypeId[] = ["casual-critic", "curator", "explorer", "comfort-rewatcher"]

export type EvidenceGraphic = "hour-ring" | "meter" | "calendar-dots" | "shelf"

/** The colourway and evidence graphic of each archetype (design 5.3). */
export interface ArchetypeStyle {
  field: InkName
  /** The spot colour on the field; null prints in two inks (hatch and solid). */
  spot: InkName | null
  graphic: EvidenceGraphic
}

export const ARCHETYPE_STYLE: Record<ArchetypeId, ArchetypeStyle> = {
  "midnight-marathoner": { field: "ultramarine", spot: "marigold", graphic: "hour-ring" },
  "credits-roller": { field: "forest", spot: "mint", graphic: "meter" },
  "comfort-rewatcher": { field: "peach", spot: "oxblood", graphic: "shelf" },
  "premiere-chaser": { field: "coral", spot: null, graphic: "meter" },
  "series-devourer": { field: "mint", spot: "ultramarine", graphic: "meter" },
  "weekend-double-feature": { field: "rose", spot: "ultramarine", graphic: "calendar-dots" },
  curator: { field: "paper", spot: "ultramarine", graphic: "shelf" },
  explorer: { field: "petrol", spot: "marigold", graphic: "meter" },
  loyalist: { field: "oxblood", spot: "peach", graphic: "meter" },
  "golden-hour-viewer": { field: "marigold", spot: "oxblood", graphic: "hour-ring" },
  "festival-juror": { field: "lilac", spot: "forest", graphic: "shelf" },
  "casual-critic": { field: "sky", spot: "ultramarine", graphic: "calendar-dots" },
}

/** The prefix of each archetype's poster-line ids. */
const POSTER_PREFIX: Record<ArchetypeId, string> = {
  "midnight-marathoner": "mm",
  "credits-roller": "cr",
  "comfort-rewatcher": "rw",
  "premiere-chaser": "pc",
  "series-devourer": "sd",
  "weekend-double-feature": "wd",
  curator: "cu",
  explorer: "ex",
  loyalist: "lo",
  "golden-hour-viewer": "gh",
  "festival-juror": "fj",
  "casual-critic": "cc",
}

/**
 * The five poster-line ids of an archetype, which the LLM chooses from.
 *
 * @example
 * ```ts
 * posterLineIds("midnight-marathoner") // ["mm.1", "mm.2", "mm.3", "mm.4", "mm.5"]
 * ```
 */
export function posterLineIds(id: ArchetypeId): string[] {
  return [1, 2, 3, 4, 5].map((n) => `${POSTER_PREFIX[id]}.${n}`)
}

/** All sixty poster-line ids. */
export const POSTER_LINE_IDS = ARCHETYPE_IDS.flatMap(posterLineIds) as [string, ...string[]]

export function getArchetype(id: ArchetypeId) {
  // Ids come from the closed union, so the lookup always succeeds
  return ARCHETYPES.find((a) => a.id === id)!
}
