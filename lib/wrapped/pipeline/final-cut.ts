/**
 * Which copy slots the final cut writes again (design 7.1, P8.5).
 *
 * On 1 January every issue is rebuilt with the full year. Numbers that only
 * grew re-render through their tokens for free, so a slot keeps its stored
 * text unless what its claim depends on moved:
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
 * a pocket member who crossed into the full issue gets every slot. Pocket
 * and postcard issues have no copy, so their plan is empty.
 *
 * @module lib/wrapped/pipeline/final-cut
 */

import { slotDependencyHash, slotsForPages, type CopySlot, type SlotId } from "@/lib/wrapped/copy/slots"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

type FinalCutReason = "identity-changed" | "band-crossed" | "page-newly-selected" | "edition-changed"

type SlotDecision =
  | { slot: SlotId; action: "keep" }
  | { slot: SlotId; action: "regenerate"; reason: FinalCutReason; fact?: FactId }

/** The stored season issue, as far as the plan reads it. */
export interface StoredIssue {
  edition: RewindDataV3["edition"]
  pages: readonly PageType[]
  facts: RewindFactsV3
  hasCopy: boolean
  slotHashes: Readonly<Record<string, string>>
}

/** The rebuilt issue: its edition, selected pages and full-year facts. */
export interface NextIssue {
  edition: RewindDataV3["edition"]
  selected: readonly PageType[]
  facts: RewindFactsV3
}

export interface FinalCutPlan {
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
function changeOf(slot: CopySlot, stored: RewindFactsV3, next: RewindFactsV3): { reason: FinalCutReason; fact?: FactId } {
  const identity = slot.identity.find((id) => value(stored, id) !== value(next, id))
  if (identity) return { reason: "identity-changed", fact: identity }
  const band = slot.bands.find(({ fact, at }) => side(stored, fact, at) !== side(next, fact, at))
  if (band) return { reason: "band-crossed", fact: band.fact }
  // The slot's definition changed since the stored issue was written.
  return { reason: "identity-changed" }
}

/** Plans the final cut's copy for one member; see the module comment. */
export function planFinalCut(stored: StoredIssue, next: NextIssue): FinalCutPlan {
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

/** One member's plan in a dry run's tally. */
export interface PlannedMember {
  plan: FinalCutPlan
}

export interface FinalCutTally {
  members: number
  keepAll: number
  recall: number
  /** Reason (with its fact, as `reason: fact`) to how many slots it regenerates. */
  reasons: Record<string, number>
}

/** The dry run's summary: how many members keep all copy, how many re-call, and why. */
export function tallyFinalCut(members: readonly PlannedMember[]): FinalCutTally {
  const reasons: Record<string, number> = {}
  let recall = 0
  for (const { plan } of members) {
    if (plan.regenerate.length > 0) recall++
    for (const d of plan.slots) {
      if (d.action !== "regenerate") continue
      const key = d.fact ? `${d.reason}: ${d.fact}` : d.reason
      reasons[key] = (reasons[key] ?? 0) + 1
    }
  }
  return { members: members.length, keepAll: members.length - recall, recall, reasons }
}

/** "18 of 20 keep all copy, 2 re-call (identity-changed: series[1].title; band-crossed: hours.afterDarkShare)". */
export function describeTally(tally: FinalCutTally): string {
  const head = `${tally.keepAll} of ${tally.members} keep all copy, ${tally.recall} re-call`
  const reasons = Object.keys(tally.reasons).sort()
  return reasons.length === 0 ? head : `${head} (${reasons.join("; ")})`
}
