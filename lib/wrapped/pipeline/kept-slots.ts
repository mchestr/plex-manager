/**
 * Which copy slots a regeneration of a stored issue keeps (P7.7).
 *
 * A hide or unhide rebuilds the member's issue with `copyPolicy: 'no-llm'`.
 * Numbers that only moved re-render through their tokens for free, so a slot
 * keeps its stored text unless what its claim depends on moved; every other
 * slot is a template:
 *
 * ```
 * slot of a selected page (full edition only)
 *   ├─ stored issue was another edition, or had no copy ─► regenerate (edition-changed)
 *   ├─ its page was not in the stored issue ─────────────► regenerate (page-newly-selected)
 *   ├─ slotDependencyHash = stored copyMeta.slotHashes ──► keep
 *   └─ otherwise: an identity fact changed ──────────────► regenerate (identity-changed, the fact)
 *                 or a band was crossed ─────────────────► regenerate (band-crossed, the fact)
 * ```
 *
 * A changed archetype changes `archetype.id`, so every archetype slot goes;
 * a pocket issue that an unhide grows into the full one gets every slot.
 * Pocket and postcard issues have no copy, so their plan is empty.
 *
 * @module lib/wrapped/pipeline/kept-slots
 */

import { slotDependencyHash, slotsForPages, type CopySlot, type SlotId } from "@/lib/wrapped/copy/slots"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

type RewriteReason = "identity-changed" | "band-crossed" | "page-newly-selected" | "edition-changed"

type SlotDecision =
  | { slot: SlotId; action: "keep" }
  | { slot: SlotId; action: "regenerate"; reason: RewriteReason; fact?: FactId }

/** The stored issue, as far as the plan reads it. */
export interface StoredIssue {
  edition: RewindDataV3["edition"]
  pages: readonly PageType[]
  facts: RewindFactsV3
  hasCopy: boolean
  slotHashes: Readonly<Record<string, string>>
}

/** The rebuilt issue: its edition, selected pages and facts. */
export interface NextIssue {
  edition: RewindDataV3["edition"]
  selected: readonly PageType[]
  facts: RewindFactsV3
}

interface KeptSlotsPlan {
  slots: SlotDecision[]
  keep: SlotId[]
  regenerate: SlotId[]
}

/** The plan's view of a stored v3 issue. */
export function storedIssueOf(data: RewindDataV3): StoredIssue {
  return {
    edition: data.edition,
    pages: data.pages.map((page) => page.type),
    facts: data.facts,
    hasCopy: data.copy !== null,
    slotHashes: data.copyMeta.slotHashes,
  }
}

const value = (facts: RewindFactsV3, id: FactId) => facts[id]?.value ?? null
const side = (facts: RewindFactsV3, id: FactId, at: readonly number[]) => {
  const v = facts[id]?.value
  return typeof v === "number" ? at.filter((t) => v >= t).length : null
}

/** Why a slot whose hash moved must be written again. */
function changeOf(slot: CopySlot, stored: RewindFactsV3, next: RewindFactsV3): { reason: RewriteReason; fact?: FactId } {
  const identity = slot.identity.find((id) => value(stored, id) !== value(next, id))
  if (identity) return { reason: "identity-changed", fact: identity }
  const band = slot.bands.find(({ fact, at }) => side(stored, fact, at) !== side(next, fact, at))
  if (band) return { reason: "band-crossed", fact: band.fact }
  // The slot's definition changed since the stored issue was written.
  return { reason: "identity-changed" }
}

/** Plans which of the member's slots the regeneration keeps; see the module comment. */
export function planKeptSlots(stored: StoredIssue, next: NextIssue): KeptSlotsPlan {
  if (next.edition !== "full") return { slots: [], keep: [], regenerate: [] }
  const slots = slotsForPages(next.selected).map((slot): SlotDecision => {
    if (stored.edition !== next.edition || !stored.hasCopy) return { slot: slot.id, action: "regenerate", reason: "edition-changed" }
    const storedHash = stored.slotHashes[slot.id]
    if (!stored.pages.includes(slot.page) || !storedHash) return { slot: slot.id, action: "regenerate", reason: "page-newly-selected" }
    if (storedHash === slotDependencyHash(slot, next.facts)) return { slot: slot.id, action: "keep" }
    return { slot: slot.id, action: "regenerate", ...changeOf(slot, stored.facts, next.facts) }
  })
  return {
    slots,
    keep: slots.filter((d) => d.action === "keep").map((d) => d.slot),
    regenerate: slots.filter((d) => d.action === "regenerate").map((d) => d.slot),
  }
}
