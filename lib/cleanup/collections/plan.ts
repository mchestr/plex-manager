/**
 * The pure plans of the Plex collection sync (TS 8.10). No call, no clock
 * read, no database: `sync.ts` runs what these functions decide.
 *
 * | Step | Function | Gives |
 * |---|---|---|
 * | 2 | {@link wantedLists} | The wanted rating keys of each `"<sectionId>:<level>"` collection, in order |
 * | 4.2 | {@link pickAdoption} | The collection to adopt and the extra ones to delete |
 * | 4.5, 4.6 | {@link memberPlan} | The members to remove and the keys to add |
 * | 4.7 | {@link movePlan} | The fewest moves that give the wanted order |
 * | 4.8 | {@link hubPlan} | Whether to create the hub, update it, or leave it |
 * | 5 | {@link pruneNotices} | The notices younger than 30 days |
 *
 * Order (step 2): `leaveOn` ascending, then `sizeBytes` descending, then
 * `itemKey`. A key that is not digits never reaches a Plex URL (TS 7.2.1
 * item 8), so it is left out of the wanted list.
 *
 * @module lib/cleanup/collections/plan
 */

import type { RuntimeNotice } from "@/lib/cleanup/schema/runtime"
import { LEVELS, type Level } from "@/lib/validations/cleanup-vocabulary"

/** The item fields the sync reads (a `CleanupItem` row in state `leaving` or `approved`). */
export interface ShownItem {
  itemKey: string
  level: string
  sectionId: string
  ratingKey: string
  leaveOn: string | null
  sizeBytes: bigint
}

/** Where a collection is shown, as the runtime stores it. */
export interface HubFlags {
  ownHome: boolean
  sharedHome: boolean
  recommended: boolean
}

/** Notices stay this long (TS 2.7). @internal */
export const NOTICE_KEEP_MS = 30 * 24 * 60 * 60_000

const DIGITS = /^\d+$/

/** The runtime key of a collection: `"<sectionId>:<level>"`. @internal */
export function collectionKey(sectionId: string, level: Level): string {
  return `${sectionId}:${level}`
}

/** The section and level of a runtime key, or null when it is not one. */
export function parseCollectionKey(key: string): { sectionId: string; level: Level } | null {
  const [sectionId, level, ...rest] = key.split(":")
  const known = LEVELS.find((name) => name === level)
  return rest.length === 0 && DIGITS.test(sectionId) && known ? { sectionId, level: known } : null
}

function byLeaveOrder(a: ShownItem, b: ShownItem): number {
  if (a.leaveOn !== b.leaveOn) return a.leaveOn === null ? 1 : b.leaveOn === null ? -1 : a.leaveOn < b.leaveOn ? -1 : 1
  if (a.sizeBytes !== b.sizeBytes) return a.sizeBytes > b.sizeBytes ? -1 : 1
  return a.itemKey < b.itemKey ? -1 : a.itemKey > b.itemKey ? 1 : 0
}

/** Step 2: the wanted rating keys of each collection, the soonest leave date first. Empty for every key when `shown` is false. */
export function wantedLists(items: readonly ShownItem[], shown: boolean): Map<string, string[]> {
  const lists = new Map<string, string[]>()
  if (!shown) return lists
  for (const item of [...items].sort(byLeaveOrder)) {
    const level = LEVELS.find((name) => name === item.level)
    if (!level || !DIGITS.test(item.sectionId) || !DIGITS.test(item.ratingKey)) continue
    const key = collectionKey(item.sectionId, level)
    const list = lists.get(key) ?? []
    if (!list.includes(item.ratingKey)) list.push(item.ratingKey)
    lists.set(key, list)
  }
  return lists
}

/** Steps 4.5 and 4.6: the members that leave, and the wanted keys to add, in wanted order. */
export function memberPlan(members: readonly string[], wanted: readonly string[]): { remove: string[]; add: string[] } {
  const want = new Set(wanted)
  const have = new Set(members)
  return { remove: [...new Set(members.filter((key) => !want.has(key)))], add: wanted.filter((key) => !have.has(key)) }
}

/** The positions in `values` of one longest increasing run (not always contiguous). */
function longestIncreasing(values: readonly number[]): Set<number> {
  const tails: number[] = []
  const before = new Array<number>(values.length).fill(-1)
  values.forEach((value, at) => {
    let low = 0
    let high = tails.length
    while (low < high) {
      const mid = (low + high) >> 1
      if (values[tails[mid]] < value) low = mid + 1
      else high = mid
    }
    before[at] = low > 0 ? tails[low - 1] : -1
    tails[low] = at
  })
  const kept = new Set<number>()
  for (let at = tails.length > 0 ? tails[tails.length - 1] : -1; at !== -1; at = before[at]) kept.add(at)
  return kept
}

/**
 * Step 4.7: the moves that turn `members` into `wanted`, as
 * `{ key, after }` (`after: null` moves to the front). The members of one
 * longest run already in wanted order stay. Every other wanted key moves
 * once, right after the wanted key before it, in wanted order. So only items
 * out of order move, and no plan has fewer moves. `members` must hold the
 * wanted keys only (after steps 4.5 and 4.6).
 */
export function movePlan(members: readonly string[], wanted: readonly string[]): { key: string; after: string | null }[] {
  const rank = new Map(wanted.map((key, at) => [key, at]))
  const placed = members.filter((key) => rank.has(key))
  const keep = new Set([...longestIncreasing(placed.map((key) => rank.get(key) ?? 0))].map((at) => placed[at]))
  return wanted.flatMap((key, at) => (keep.has(key) ? [] : [{ key, after: at === 0 ? null : wanted[at - 1] }]))
}

/** Step 4.2: adopt the adoptable collection with the lowest rating key; the other adoptable ones are deleted. */
export function pickAdoption<T extends { ratingKey: string }>(adoptable: readonly T[]): { adopt: T | null; extra: T[] } {
  const sorted = [...adoptable].sort((a, b) => Number(a.ratingKey) - Number(b.ratingKey))
  return { adopt: sorted[0] ?? null, extra: sorted.slice(1) }
}

/** Step 4.8: no hub and a flag on creates it, a hub with other flags is updated (three zeros when all are off), else nothing. */
export function hubPlan(current: HubFlags | null, wanted: HubFlags): "create" | "update" | null {
  if (current === null) return wanted.ownHome || wanted.sharedHome || wanted.recommended ? "create" : null
  const same = current.ownHome === wanted.ownHome && current.sharedHome === wanted.sharedHome && current.recommended === wanted.recommended
  return same ? null : "update"
}

/** Step 5: the notices detected in the last 30 days. A notice whose date does not parse goes. */
export function pruneNotices(notices: readonly RuntimeNotice[], now: Date): RuntimeNotice[] {
  const cutoff = now.getTime() - NOTICE_KEEP_MS
  return notices.filter((notice) => Date.parse(notice.detectedAt) >= cutoff)
}
