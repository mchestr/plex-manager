/**
 * The title rows of the turn-on page (UX 4.6): the posters, "The 10
 * largest", the titles larger than the daily space budget (E17, X13) and
 * the dry runs of the saved definition (X7). Pure and client-safe; the
 * rows name requesters, so only admin surfaces build them.
 *
 * A Leaving soon row whose title the library data lacks (Change mode) has
 * no evaluation: it keeps its stored title and poster, and "The 10
 * largest" leaves it out, since it has no facts to show.
 *
 * @module lib/cleanup/screens/turn-on/rows
 */

import { classify } from "@/lib/cleanup/engine/classify"
import type { CompiledRule, EvalContext } from "@/lib/cleanup/engine/types"
import { whyText } from "@/lib/cleanup/engine/why-text"
import { memberWords } from "@/lib/cleanup/preview/draft"
import { addedAt, itemRef, lastPlayedAt, requestedBy } from "@/lib/cleanup/preview/rows"
import type { ReviewItem } from "@/lib/cleanup/run/turn-on-review"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import type { DryRunEntry } from "@/lib/cleanup/schema/stats"
import { titleWords } from "@/lib/cleanup/screens/overview/rule-footer"
import type { TurnOnLargestRow } from "@/lib/cleanup/types/rule-parts"

/** Posters and rows of the page (UX 4.6): ten each. */
export const TURN_ON_ROWS = 10

/** The stored title and poster of a Leaving soon row (`CleanupItem`). */
export interface StoredTitle {
  title: string
  seasonNumber: number | null
  ratingKey: string
}

/** The poster rating keys of the ten largest titles. */
export function posterKeys(set: readonly ReviewItem[], stored: ReadonlyMap<string, StoredTitle>): string[] {
  return set.slice(0, TURN_ON_ROWS).flatMap((entry) => {
    const key = entry.result?.item.ratingKey ?? stored.get(entry.itemKey)?.ratingKey
    return key ? [key] : []
  })
}

/** "The 10 largest" with their Results columns and Why text. */
export function largestRows(set: readonly ReviewItem[], input: { compiled: CompiledRule; ctx: EvalContext | null; sources: readonly SourceStatus[] }):
  TurnOnLargestRow[] {
  const { ctx } = input
  if (!ctx) return []
  const why = { compiled: input.compiled, ctx, words: memberWords(ctx.live), sources: input.sources }
  return set.flatMap((entry) => (entry.result ? [entry.result] : [])).slice(0, TURN_ON_ROWS).map((result) => {
    const item = result.item
    return { ...itemRef(item), lastPlayedAt: lastPlayedAt(item), addedAt: addedAt(item), requestedBy: requestedBy(item, ctx),
      why: whyText(result, classify(result), why) }
  })
}

/** The titles larger than the daily space budget, and the day each goes alone (X13). */
export function oversizeTitles(oversize: readonly { itemKey: string; day: string }[], set: readonly ReviewItem[],
  stored: ReadonlyMap<string, StoredTitle>): { title: string; day: string }[] {
  const items = new Map(set.map((entry) => [entry.itemKey, entry.result?.item]))
  return oversize.map(({ itemKey, day }) => {
    const known = items.get(itemKey) ?? stored.get(itemKey)
    return { title: known ? titleWords(known.title, known.seasonNumber) : itemKey, day }
  })
}

/** The dry runs of the saved definition (equal `definitionHash`), the newest per library read, oldest first (X7). */
export function dryRunPoints(dryRuns: readonly DryRunEntry[], definitionHash: string): { at: string; matches: number }[] {
  const bySnapshot = new Map<string, DryRunEntry>()
  for (const run of dryRuns) {
    const kept = bySnapshot.get(run.snapshotId)
    if (run.definitionHash === definitionHash && (!kept || Date.parse(run.at) > Date.parse(kept.at))) bySnapshot.set(run.snapshotId, run)
  }
  return [...bySnapshot.values()].sort((a, b) => Date.parse(a.at) - Date.parse(b.at)).map(({ at, matches }) => ({ at, matches }))
}
