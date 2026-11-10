/**
 * The status of a Leaving soon item (TS 8.6, UX 4.12.6): the `cleanupItem`
 * status domain of `lib/ui/status.ts`, with its `{day}` and `{note}` values.
 * Pure and client-safe. The first matching row of the TS 8.6 table wins.
 *
 * "Due" is the TS 8.7 rule (`isDue`): a leave date that has come, and no
 * hold after a turn-on or a resume. So "Waits for you" names only an item
 * that a deletion batch holds. The planned day comes from `planBudget()`.
 *
 * @module lib/cleanup/engine/status
 */

import type { ItemState, ItemStatus } from "@/lib/cleanup/constants"
import { earliestDay, isDue } from "@/lib/cleanup/engine/budget"

const DAY_MS = 86_400_000

/** The `CleanupItem` columns that decide the status. */
export interface StatusItem {
  itemKey: string
  state: ItemState
  /** Day key; null while held. */
  leaveOn: string | null
  needsApproval: boolean
  failCode: string | null
  holdCode: string | null
  deferredAt: Date | string | null
  postponedAt: Date | string | null
  /** The name of the admin who postponed it ("To {day} by {name}"). The caller resolves it. */
  postponedBy?: string | null
}

export interface StatusContext {
  /** The feature is off, or cleanup is paused. */
  paused: boolean
  /** Epoch ms. */
  now: number
  today: string
  holdUntil: string | null
  /** `planBudget().plan`: the planned day of each delete candidate (TS 8.7). */
  plan: ReadonlyMap<string, string>
  /** The words of a hold or a failure code (`holdCodeWords`, the failure copy). Without them, `{note}` is the code. */
  words?: { hold?: (code: string) => string; failure?: (code: string) => string }
}

export interface ItemStatusResult {
  status: ItemStatus
  /** The status placeholders of UX 4.12.6. */
  values: { day?: string; note?: string }
}

const time = (value: Date | string) => (typeof value === "string" ? Date.parse(value) : value.getTime())

/** The status of one item: the first row of TS 8.6 that applies. */
export function itemStatus(item: StatusItem, ctx: StatusContext): ItemStatusResult {
  if (ctx.paused) return { status: "paused", values: {} }
  if (item.state === "deleting") return { status: "deleting", values: {} }
  if (item.failCode) return { status: "failed", values: { note: ctx.words?.failure?.(item.failCode) ?? item.failCode } }
  if (item.holdCode) return { status: "onHold", values: { note: ctx.words?.hold?.(item.holdCode) ?? item.holdCode } }
  if (item.deferredAt !== null && ctx.now - time(item.deferredAt) < DAY_MS) return { status: "deferred", values: {} }

  const due = isDue(item.leaveOn, ctx.today, ctx.holdUntil)
  if (due && item.needsApproval && item.state === "leaving") return { status: "waitsForYou", values: {} }
  if (item.postponedAt !== null && !due && item.leaveOn !== null) {
    return { status: "postponed", values: item.postponedBy ? { day: item.leaveOn, note: item.postponedBy } : { day: item.leaveOn } }
  }

  const planned = ctx.plan.get(item.itemKey)
  const goesByItself = !item.needsApproval || item.state === "approved"
  if (goesByItself && planned !== undefined && item.leaveOn !== null) {
    const earliest = earliestDay(item.leaveOn, ctx.today, ctx.holdUntil)
    return { status: planned > earliest ? "waitsForBudget" : "deletesOn", values: { day: planned } }
  }
  return { status: "leaving", values: {} }
}
