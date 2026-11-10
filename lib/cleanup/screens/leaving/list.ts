/**
 * The grouped list of the Leaving soon tab (UX 4.7.2, TS 10.5, 12.7 item 8).
 * Server-only (it names a show with the key helper of the run).
 *
 * 1. Every title in Leaving soon (`leaving`, `approved`, `deleting`) gets
 *    its status from `itemStatus()` with the display plan.
 * 2. The filters `q`, `rule`, `status` and `library` apply to this list only.
 * 3. Sort: the due group first, then by leave date, then the largest first,
 *    then by item key (the budget order).
 * 4. Groups follow the leave date. The due group ("Today, {day}") holds every
 *    due title. Titles of a deletion batch show in their card, not as rows,
 *    and their group reads "Shown above" (`inBatch`).
 * 5. The rows come in pages of `size` items, counted across groups. A page
 *    lists the groups of its rows, and page 1 also the due group of a batch.
 *
 * @module lib/cleanup/screens/leaving/list
 */

import "server-only"

import type { ItemState } from "@/lib/cleanup/constants"
import { isDue } from "@/lib/cleanup/engine/budget"
import { itemStatus, type StatusContext } from "@/lib/cleanup/engine/status"
import { showKeyOf } from "@/lib/cleanup/run/show-raise"
import { itemRefOf, levelOf } from "@/lib/cleanup/screens/leaving/item-ref"
import type { LeavingParams } from "@/lib/cleanup/screens/leaving/params"
import type { People } from "@/lib/cleanup/screens/leaving/people"
import type { LeavingGroup, LeavingRow } from "@/lib/cleanup/types/list-parts"
import type { CountBytes, NamedRule } from "@/lib/cleanup/types/rule-parts"
import type { CleanupItem } from "@/lib/generated/prisma/client"
import { plexItemHref } from "@/lib/ui/plex-links"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** An item row as the list reads it: every column but the stored Why. */
export type ListItem = Omit<CleanupItem, "why">

export interface ListContext {
  /** The status context without its words: they follow each row. */
  status: Omit<StatusContext, "words">
  /** The words of a hold code, and of a failure code at a level. */
  hold: (code: string) => string
  failure: (code: string, level: string) => string
  people: People
  /** The rule of an id; a rule that is gone reads "A deleted rule". */
  rule: (ruleId: string) => NamedRule
  library: (sectionId: string) => string
  machineId: string | null
  /** The item keys of the deletion batch cards. */
  inBatch: ReadonlySet<string>
}

export interface LeavingList {
  groups: LeavingGroup[]
  rows: LeavingRow[]
  totals: CountBytes & { bytesValue: bigint }
  total: number
}

const groupOf = (item: ListItem, ctx: ListContext): string =>
  item.leaveOn === null || isDue(item.leaveOn, ctx.status.today, ctx.status.holdUntil) ? "due" : item.leaveOn

const byList = (ctx: ListContext) => (a: ListItem, b: ListItem) => {
  const ga = groupOf(a, ctx)
  const gb = groupOf(b, ctx)
  if (ga !== gb) return ga === "due" ? -1 : gb === "due" ? 1 : ga < gb ? -1 : 1
  return b.sizeBytes > a.sizeBytes ? 1 : b.sizeBytes < a.sizeBytes ? -1 : a.itemKey < b.itemKey ? -1 : 1
}

function rowOf(item: ListItem, ctx: ListContext, shows: ReadonlySet<string>): LeavingRow {
  const postponedBy = ctx.people.words(item.postponedBy)
  const words = { hold: ctx.hold, failure: (code: string) => ctx.failure(code, item.level) }
  const { status, values } = itemStatus({ ...item, state: item.state as ItemState, postponedBy }, { ...ctx.status, words })
  return {
    ...itemRefOf(item), library: ctx.library(item.sectionId), rules: item.ruleIds.map(ctx.rule),
    showAlsoLeaving: item.level === "season" && shows.has(showKeyOf(item.titleKey)),
    state: item.state as ItemState, leaveAt: item.leaveOn, group: groupOf(item, ctx), status, statusValues: values,
    holdCode: item.holdCode, failCode: item.failCode, deferredAt: item.deferredAt?.toISOString() ?? null, postponedBy,
    plannedDay: ctx.status.plan.get(item.itemKey) ?? null, plexUrl: plexItemHref(ctx.machineId, item.ratingKey),
  }
}

function matches(row: LeavingRow, item: ListItem, params: LeavingParams): boolean {
  if (params.q && !item.title.toLowerCase().includes(params.q.toLowerCase())) return false
  if (params.rule && !item.ruleIds.includes(params.rule)) return false
  if (params.status && row.status !== params.status) return false
  return !params.library || item.sectionId === params.library
}

interface GroupSum {
  count: number
  bytes: bigint
  levels: Set<Level>
  inBatch: boolean
}

/** The grouped, filtered and paged list. */
export function buildList(items: readonly ListItem[], params: LeavingParams, ctx: ListContext): LeavingList {
  const shows = new Set(items.filter((item) => item.level === "show").map((item) => item.itemKey))
  const listed = [...items].sort(byList(ctx)).flatMap((item) => {
    const row = rowOf(item, ctx, shows)
    return matches(row, item, params) ? [{ item, row }] : []
  })
  const sums = new Map<string, GroupSum>()
  for (const { item, row } of listed) {
    const sum = sums.get(row.group) ?? { count: 0, bytes: 0n, levels: new Set<Level>(), inBatch: false }
    sums.set(row.group, { count: sum.count + 1, bytes: sum.bytes + item.sizeBytes, levels: sum.levels.add(levelOf(item.level)),
      inBatch: sum.inBatch || ctx.inBatch.has(item.itemKey) })
  }
  const paged = listed.filter(({ item }) => !ctx.inBatch.has(item.itemKey)).map(({ row }) => row)
  const rows = paged.slice((params.page - 1) * params.size, params.page * params.size)
  const shown = new Set(rows.map((row) => row.group))
  if (params.page === 1 && sums.get("due")?.inBatch) shown.add("due")
  const groups = [...sums].filter(([date]) => shown.has(date)).map(([date, sum]): LeavingGroup => ({
    date, count: sum.count, bytes: sum.bytes.toString(), inBatch: sum.inBatch, level: sum.levels.size === 1 ? [...sum.levels][0] : null,
  }))
  const bytesValue = listed.reduce((total, { item }) => total + item.sizeBytes, 0n)
  return { groups, rows, totals: { count: listed.length, bytes: bytesValue.toString(), bytesValue }, total: paged.length }
}
