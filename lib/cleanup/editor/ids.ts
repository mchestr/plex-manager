/**
 * New ids of a draft (TS 12.6): `c` conditions, `p` rule protections, `a`
 * any-of groups. Each prefix takes the next number above every number it
 * has used, so an id never comes back within one draft. Client-safe.
 *
 * @module lib/cleanup/editor/ids
 */

import { idsOf } from "@/lib/cleanup/editor/tree"
import type { RuleDraft } from "@/lib/validations/cleanup-draft"

const PREFIXES = ["c", "p", "a"] as const
export type IdPrefix = (typeof PREFIXES)[number]
/** The next number of each prefix. */
export type IdCounters = Readonly<Record<IdPrefix, number>>

/** Ids run from 1 to 999 (`conditionIdSchema`, `groupIdSchema`). */
const MAX_ID_NUMBER = 999

const ID_PATTERN = /^([cpa])([1-9]\d{0,2})$/

/** The counters of a draft: one above the highest number of each prefix. `floor` keeps numbers already given out. */
export function countersOf(draft: RuleDraft, floor?: IdCounters): IdCounters {
  const next: Record<IdPrefix, number> = { c: floor?.c ?? 1, p: floor?.p ?? 1, a: floor?.a ?? 1 }
  for (const id of idsOf(draft)) {
    const match = ID_PATTERN.exec(id)
    const prefix = PREFIXES.find((p) => p === match?.[1])
    if (match && prefix) next[prefix] = Math.max(next[prefix], Number(match[2]) + 1)
  }
  return next
}

/** A new id and the counters after it, or null when the prefix has no number left. */
export function takeId(next: IdCounters, prefix: IdPrefix): { id: string; next: IdCounters } | null {
  const n = next[prefix]
  if (n > MAX_ID_NUMBER) return null
  return { id: `${prefix}${n}`, next: { ...next, [prefix]: n + 1 } }
}
