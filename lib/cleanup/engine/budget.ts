/**
 * The daily deletion budget (TS 8.7, E17, E21): the day each delete candidate
 * goes. Pure and client-safe. The act step deletes the candidates planned for
 * today, in plan order. The Leaving soon tab, the batch cards and the turn-on
 * page show the same plan.
 *
 * Order: the earliest day first. On one day, the season items of a show come
 * before the show (E21), then the largest first, then by item key. The cursor
 * day never moves back, so a season is never planned after its show. A show
 * also never plans before a season of it that is a candidate, even when its
 * own leave date is earlier (E21 kept as an invariant, not assumed).
 *
 * E17: a day with nothing on it takes any one item, so an item larger than
 * the bytes budget goes alone on an empty day. `oversize` names it.
 *
 * @module lib/cleanup/engine/budget
 */

import { addDays } from "@/lib/ui/date-range"
import type { Level } from "@/lib/validations/cleanup-vocabulary"

/** @internal Exported for the tests. */
export interface BudgetCandidate {
  itemKey: string
  level: Level
  /** The show part of the key ("tvdb:9"). A season item holds its show's `titleKey`. */
  titleKey: string
  /** The leave date, a day key. */
  leaveOn: string
  sizeBytes: number | bigint
}

export interface BudgetInput {
  candidates: readonly BudgetCandidate[]
  /** `options.budget`: at most this many items and bytes a day. */
  budget: { items: number; bytes: number }
  /** Today's deletions so far (TS 8.7 step 5). */
  usedToday: { items: number; bytes: number | bigint }
  today: string
  /** Nothing is deleted before this day (turn on, resume). */
  holdUntil: string | null
}

export interface BudgetPlan {
  /** Item key to day key. It iterates in plan order: the act step deletes today's entries in this order. */
  plan: Map<string, string>
  /** The items larger than the bytes budget, each alone on its day (E17, X13). */
  oversize: { itemKey: string; day: string }[]
}

interface Entry {
  candidate: BudgetCandidate
  day: string
  size: number
}

const later = (a: string, b: string | null | undefined): string => (b && b > a ? b : a)
const byKey = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

/** `max(leaveOn, today, holdUntil)`: the earliest day an item can go (TS 8.7 step 1). */
export function earliestDay(leaveOn: string, today: string, holdUntil: string | null): string {
  return later(later(leaveOn, today), holdUntil)
}

/** Due (TS 8.7 step 1): `leaveOn ≤ today`, and `today ≥ holdUntil` when a hold is set. */
export function isDue(leaveOn: string | null, today: string, holdUntil: string | null): boolean {
  return leaveOn !== null && leaveOn <= today && (holdUntil === null || today >= holdUntil)
}

function entriesOf({ candidates, today, holdUntil }: BudgetInput): Entry[] {
  const entries = candidates.map((candidate) => ({
    candidate,
    day: earliestDay(candidate.leaveOn, today, holdUntil),
    size: Number(candidate.sizeBytes),
  }))
  const seasonDay = new Map<string, string>()
  for (const e of entries) {
    if (e.candidate.level === "season") seasonDay.set(e.candidate.titleKey, later(e.day, seasonDay.get(e.candidate.titleKey)))
  }
  for (const e of entries) if (e.candidate.level === "show") e.day = later(e.day, seasonDay.get(e.candidate.titleKey))
  return entries.sort((a, b) => byKey(a.day, b.day) || b.size - a.size || byKey(a.candidate.itemKey, b.candidate.itemKey))
}

/** Moves each show to right after the last season of it on the same day (E21). The rest keeps its order. */
function seasonsFirst(sorted: readonly Entry[]): Entry[] {
  const groupOf = (e: Entry) => `${e.day}|${e.candidate.titleKey}`
  const pending = new Map<string, number>()
  for (const e of sorted) if (e.candidate.level === "season") pending.set(groupOf(e), (pending.get(groupOf(e)) ?? 0) + 1)
  const waiting = new Map<string, Entry>()
  const out: Entry[] = []
  for (const e of sorted) {
    const group = groupOf(e)
    if (e.candidate.level === "show" && (pending.get(group) ?? 0) > 0) {
      waiting.set(group, e)
      continue
    }
    out.push(e)
    if (e.candidate.level !== "season") continue
    const left = (pending.get(group) ?? 1) - 1
    pending.set(group, left)
    const show = waiting.get(group)
    if (left === 0 && show) out.push(show)
  }
  return out
}

/** Plans each candidate on a day inside the daily budget (TS 8.7 steps 1 to 4). Never mutates its input. */
export function planBudget(input: BudgetInput): BudgetPlan {
  const maxItems = Math.max(1, Math.floor(input.budget.items))
  const maxBytes = input.budget.bytes
  const plan = new Map<string, string>()
  const oversize: BudgetPlan["oversize"] = []
  let cursor = input.today
  let used = { items: input.usedToday.items, bytes: Number(input.usedToday.bytes) }
  const fits = (size: number) => used.items + 1 <= maxItems && (used.bytes === 0 || used.bytes + size <= maxBytes)

  for (const entry of seasonsFirst(entriesOf(input))) {
    if (entry.day > cursor) {
      cursor = entry.day
      used = { items: 0, bytes: 0 }
    }
    while (!fits(entry.size)) {
      cursor = addDays(cursor, 1)
      used = { items: 0, bytes: 0 }
    }
    plan.set(entry.candidate.itemKey, cursor)
    used = { items: used.items + 1, bytes: used.bytes + entry.size }
    if (entry.size > maxBytes) oversize.push({ itemKey: entry.candidate.itemKey, day: cursor })
  }
  return { plan, oversize }
}
