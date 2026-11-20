/**
 * Time helpers of the field verdicts (TS 4.3 rule 1, TS 6.5). Every compare
 * is between instants: "more than N days ago" is `t < now − N × 86 400 000 ms`
 * and "less than N days ago" is `t ≥ now − N × 86 400 000 ms`. Snapshot
 * times are Unix seconds; `ctx.now` is epoch milliseconds. Client-safe.
 *
 * @module lib/cleanup/engine/fields/time
 */

import type { EvalContext } from "@/lib/cleanup/engine/types"
import { addDays } from "@/lib/ui/date-range"
import { dayKey } from "@/lib/utils/zoned-time"
import type { Duration } from "@/lib/validations/cleanup-rule"
import { UNIT_DAYS, UNIT_MAX } from "@/lib/validations/cleanup-vocabulary"

/** @internal One day in milliseconds; exported for the tests. */
export const DAY_MS = 86_400_000

export type DateOp = "moreThan" | "lessThan"

/** Days from the instant `t` (Unix seconds) to `now` (epoch ms), with the fraction. */
export function daysSince(t: number, now: number): number {
  return (now - t * 1000) / DAY_MS
}

/** "More than `days` days ago": strictly before the instant `now − days`. */
export function olderThan(t: number, days: number, now: number): boolean {
  return t * 1000 < now - days * DAY_MS
}

/** "Less than `days` days ago": at or after the instant `now − days`. */
export function within(t: number, days: number, now: number): boolean {
  return t * 1000 >= now - days * DAY_MS
}

/** The date predicate of `moreThan N` or `lessThan N` on one instant. */
export function datePasses(op: DateOp, t: number, days: number, now: number): boolean {
  return op === "moreThan" ? olderThan(t, days, now) : within(t, days, now)
}

/**
 * Near-miss closeness of a date (TS 6.5). `moreThan N`: the days until it
 * passes, `N − daysSince`. `lessThan N`: the days since it stopped passing,
 * `daysSince − N`. Whole days, at least 1.
 */
export function dateGap(op: DateOp, t: number, days: number, now: number): number {
  const since = Math.floor(daysSince(t, now))
  return Math.max(1, op === "moreThan" ? days - since : since - days)
}

/**
 * The first day on which `moreThan N` passes with no new play or add (TS
 * 6.5): the day of `t` in the server zone, plus N days, plus 1 day.
 */
export function dateForecast(t: number, days: number, ctx: Pick<EvalContext, "zone">): string {
  return addDays(dayKey(t * 1000, ctx.zone), days + 1)
}

/**
 * One duration in the condition's unit that includes `t` (TS 6.5 try value).
 * `moreThan`: the largest whole amount that `t` is strictly older than, at
 * most `UNIT_MAX`, none below 1. `lessThan`: `ceil(daysSince / unit) + 1`, at
 * most `UNIT_MAX`, and none when even `UNIT_MAX` cannot include `t`.
 */
export function dateTry(op: DateOp, t: number, current: Duration, now: number): Duration | null {
  const unit = current.unit
  const elapsedMs = now - t * 1000
  const unitMs = UNIT_DAYS[unit] * DAY_MS
  if (op === "moreThan") {
    let amount = Math.floor(elapsedMs / unitMs)
    if (amount * unitMs >= elapsedMs) amount -= 1 // exactly on the edge: "more than" needs one less
    amount = Math.min(amount, UNIT_MAX[unit])
    return amount >= 1 ? { amount, unit } : null
  }
  const needed = Math.max(1, Math.ceil(elapsedMs / unitMs))
  if (needed > UNIT_MAX[unit]) return null
  return { amount: Math.min(needed + 1, UNIT_MAX[unit]), unit }
}
