/**
 * The ink a page prints in, from its registry entry and the member's
 * archetype (Rewind design 4.2 and 5.3): the cover and centrefold take the
 * archetype's field with its spot; a colour page whose field is the
 * archetype's prints in its `altField`; the back cover is paper in the
 * archetype's deep ink.
 *
 * @module lib/rewind/stage/page-ink
 */

import { archetypeInks, type InkName, type InkPropsOptions } from "@/lib/design/tokens"
import type { PageMeta } from "@/lib/rewind/page-meta"
import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"

export interface PageInk {
  ink: InkName
  opts: InkPropsOptions
}

export function pageInk(entry: Pick<PageMeta, "type" | "field" | "altField">, archetype: ArchetypeId | null): PageInk {
  const arch = archetype ? archetypeInks[archetype] : null
  if (entry.field === "archetype") return { ink: arch?.field ?? "paper", opts: arch ? { spot: "arch" } : {} }
  if (entry.type === "back-cover" && arch) return { ink: "paper", opts: { ink: "arch-deep" } }
  if (arch && entry.altField && entry.field === arch.field) return { ink: entry.altField, opts: {} }
  return { ink: entry.field, opts: {} }
}
