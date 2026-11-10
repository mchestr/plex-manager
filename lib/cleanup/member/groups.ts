/**
 * The member's Leaving soon list (TS 13.3 steps 5 and 8, UX 9.2 and 9.3):
 * titles with a reason go to For you, the rest to date groups. Pure and
 * client-safe.
 *
 * 1. The input is in the budget order: `leaveOn`, then the largest first. The
 *    size orders the list and is never shown, so every `ItemRef` holds
 *    `sizeBytes: null`.
 * 2. A title whose `leaveOn` is today or earlier is due: `leaveAt` is `"due"`
 *    ("Leaves any day now"). A title with no date counts as due too.
 * 3. The due group comes first, then one group per leave day, the soonest
 *    first. A group holds every title of its day; the page shows 6 and "Show
 *    all {N}".
 * 4. The Home row takes the first 12: For you first, then the groups in order.
 *
 * @module lib/cleanup/member/groups
 */

import type { ItemRef } from "@/lib/cleanup/types/preview"
import type { ForYouItem, LeavingSoonRowData, MemberLeaveAt, MemberLeavingGroup } from "@/lib/cleanup/types/member"
import { LEVELS, type Level } from "@/lib/validations/cleanup-vocabulary"

import type { MemberReasonFact } from "./reasons"

/** The Home row holds at most this many titles (UX 9.3). */
const HOME_ROW_SIZE = 12

/** The columns of a Leaving soon row that member data reads: no size, rule, approval or admin. */
export interface MemberItemRow {
  itemKey: string
  level: string
  title: string
  year: number | null
  seasonNumber: number | null
  episodeCount: number | null
  seasonCount: number | null
  ratingKey: string
  sectionId: string
  leaveOn: string | null
}

/**
 * One visible title, in the budget order, with the member's reason and whether they keep it.
 *
 * @internal Exported for the tests.
 */
export interface MemberEntry {
  row: MemberItemRow
  reason: MemberReasonFact | null
  kept: boolean
}

export const isLevel = (value: string): value is Level => (LEVELS as readonly string[]).includes(value)

/**
 * The title as member data shows it, with no size. Null for a row whose level is not known.
 *
 * @internal Exported for the tests.
 */
export function memberItemRef(row: MemberItemRow): ItemRef | null {
  if (!isLevel(row.level)) return null
  return {
    itemKey: row.itemKey,
    level: row.level,
    title: row.title,
    year: row.year,
    seasonNumber: row.seasonNumber,
    episodeCount: row.episodeCount,
    seasonCount: row.seasonCount,
    posterKey: row.ratingKey,
    sectionId: row.sectionId,
    sizeBytes: null,
  }
}

/**
 * `"due"` on or after the leave day (in the server zone), else the leave day.
 *
 * @internal Exported for the tests.
 */
export function leaveAtOf(leaveOn: string | null, today: string): MemberLeaveAt {
  return leaveOn === null || leaveOn <= today ? "due" : leaveOn
}

/** For you and the date groups, each in the order of the input. */
export function splitMemberItems(entries: readonly MemberEntry[], today: string): { forYou: ForYouItem[]; groups: MemberLeavingGroup[] } {
  const forYou: ForYouItem[] = []
  const byDate = new Map<MemberLeaveAt, MemberLeavingGroup>()
  for (const { row, reason, kept } of entries) {
    const item = memberItemRef(row)
    if (!item) continue
    const leaveAt = leaveAtOf(row.leaveOn, today)
    if (reason) {
      forYou.push({ item, reason: reason.reason, reasonAt: reason.reasonAt, leaveAt, kept })
      continue
    }
    const group = byDate.get(leaveAt) ?? { date: leaveAt, count: 0, items: [] }
    group.items.push({ item, leaveAt, kept })
    group.count = group.items.length
    byDate.set(leaveAt, group)
  }
  const groups = [...byDate.values()].sort((a, b) => (a.date === "due" ? -1 : b.date === "due" ? 1 : a.date.localeCompare(b.date)))
  return { forYou, groups }
}

/** The Home row: the first 12 titles, For you first, with the totals. */
export function homeRow(forYou: readonly ForYouItem[], groups: readonly MemberLeavingGroup[], size = HOME_ROW_SIZE): LeavingSoonRowData {
  const all = [
    ...forYou.map(({ item, leaveAt, kept }) => ({ item, leaveAt, kept, forYou: true })),
    ...groups.flatMap((group) => group.items.map(({ item, leaveAt, kept }) => ({ item, leaveAt, kept, forYou: false }))),
  ]
  return { items: all.slice(0, size), total: all.length, forYouCount: forYou.length }
}
