/**
 * The duotone pair a page prints posters in (Rewind design 5.3, 5.8): its
 * spot and its field. A paper page's spot is the archetype's deep ink
 * (ultramarine without an archetype); every other page prints in two inks,
 * so its spot is the field's own ink, written as the field's name twice.
 *
 * ```
 *  tone=ultramarine.paper   paper page, Midnight Marathoner: #2238b8 over #f1eadc
 *  tone=marigold.marigold   Top films: marigold's own ink #1f1306 over #feb644
 * ```
 *
 * @module lib/rewind/media/tone
 */

import { archetypeInks, rewindInks, type InkName } from "@/lib/design/tokens"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

export interface TonePair {
  spot: InkName
  field: InkName
}

/** The pair for a page printed in `field` for a member of `archetype`. */
export function pageTone(field: InkName, archetype: ArchetypeId | null): TonePair {
  if (field !== "paper") return { spot: field, field }
  return { spot: archetype ? archetypeInks[archetype].deep : "ultramarine", field }
}

/**
 * The pair's colours as hex, dark tones first: the spot (the field's own ink
 * when both names match, else the spot's deep ink) and the field.
 *
 * @example
 * ```ts
 * toneHexes({ spot: "marigold", field: "marigold" }) // { spot: "#1f1306", field: "#feb644" }
 * ```
 */
export function toneHexes({ spot, field }: TonePair): { spot: string; field: string } {
  return {
    spot: spot === field ? rewindInks[field].on.hex : rewindInks[spot].deep.hex,
    field: rewindInks[field].field.hex,
  }
}
