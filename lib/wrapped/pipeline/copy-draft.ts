/**
 * The copy of one issue while the copy step builds it: each slot's text and
 * where it came from, then the stored wire shape (`RewindCopyV3Wire`) and
 * `copySource`.
 *
 * A slot's origin is `llm` (the first call), `repair` (the repair call) or
 * `template`. `copySource` is `template` when every slot is a template, `llm`
 * or `repair` when none is (`repair` once any slot needed it), and `mixed`
 * otherwise (design 8.5).
 *
 * @module lib/wrapped/pipeline/copy-draft
 */

import type { ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import { posterLineTemplate, slotTemplate, type TemplateContext } from "@/lib/wrapped/copy/templates"
import type { RewindCopyV3Wire } from "@/lib/wrapped/copy/schema"
import { DECK_SLOT_IDS, slotsForPages, type SlotId } from "@/lib/wrapped/copy/slots"
import type { PageType } from "@/lib/wrapped/data/page-types"

export type CopySource = "llm" | "repair" | "template" | "mixed"
type SlotOrigin = "llm" | "repair" | "template"

/** The slots that hold text; the poster line is an id, kept with the archetype. */
export type TextSlotId = Exclude<SlotId, "archetype.posterLineId">

type DeckSlotId = (typeof DECK_SLOT_IDS)[number]
type DeckKey = keyof RewindCopyV3Wire["decks"]

export interface CopyDraft {
  texts: Map<TextSlotId, { text: string; origin: SlotOrigin }>
  archetype: { id: ArchetypeId; posterLineId: string; origin: SlotOrigin }
}

/** The text slots of the selected pages, in slot order. */
export function textSlots(selected: readonly PageType[]): TextSlotId[] {
  return slotsForPages(selected)
    .map((s) => s.id)
    .filter((id): id is TextSlotId => id !== "archetype.posterLineId")
}

const deckKey = (id: DeckSlotId) => id.slice("deck.".length) as DeckKey

/** The wire field a text slot is stored in, as a path. */
export function wireText(copy: RewindCopyV3Wire, id: TextSlotId): string | null {
  if (id === "archetype.tagline") return copy.archetype.tagline
  if (id === "archetype.dedication") return copy.archetype.dedication
  if (id === "signOff") return copy.signOff
  return copy.decks[deckKey(id)]
}

/** A draft of templates only: the code's archetype and a poster line picked for the member. */
export function templateDraft(slots: readonly TextSlotId[], archetype: ArchetypeId, ctx: TemplateContext): CopyDraft {
  return {
    texts: new Map(slots.map((id) => [id, { text: slotTemplate(id, ctx), origin: "template" as const }])),
    archetype: { id: archetype, posterLineId: posterLineTemplate(archetype, ctx.userId), origin: "template" },
  }
}

/** The stored copy: unselected decks and a sign-off that was not written are null. */
export function toWire(draft: CopyDraft): RewindCopyV3Wire {
  const text = (id: TextSlotId) => draft.texts.get(id)?.text ?? null
  const decks = Object.fromEntries(DECK_SLOT_IDS.map((id) => [deckKey(id), text(id)])) as RewindCopyV3Wire["decks"]
  return {
    decks,
    archetype: {
      id: draft.archetype.id,
      tagline: text("archetype.tagline") ?? "",
      dedication: text("archetype.dedication") ?? "",
      posterLineId: draft.archetype.posterLineId,
    },
    signOff: text("signOff"),
  }
}

/** `copySource` from the slots' origins (module comment). */
export function copySourceOf(draft: CopyDraft): CopySource {
  const origins = [...[...draft.texts.values()].map((t) => t.origin), draft.archetype.origin]
  if (origins.every((o) => o === "template")) return "template"
  if (origins.every((o) => o !== "template")) return origins.includes("repair") ? "repair" : "llm"
  return "mixed"
}
