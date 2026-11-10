/**
 * Library fields (TS 4.2, 4.3): `library.added` and `file.size`.
 *
 * `library.added` has two sources, Plex and the arr app (E16). As a
 * condition, every known date must pass. As a protection, one known date is
 * enough. A failed arr source leaves its date missing, and that missing date
 * is Unknown: it decides the result only when the known dates do not.
 * Client-safe.
 *
 * @module lib/cleanup/engine/fields/library
 */

import { allOf, anyOf, ARR_NAMES, dateOf, monthOf, newest, passWhen, phrases, sourceFailed, unknown } from "@/lib/cleanup/engine/fields/shared"
import { dateForecast, dateGap, datePasses, dateTry, daysSince } from "@/lib/cleanup/engine/fields/time"
import type { EvalContext, FieldEval, WhyPart } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { formatBytes } from "@/lib/utils/format"
import { type ConditionOf, durationDays } from "@/lib/validations/cleanup-rule"
import { GiB, LEVEL_ARR, TiB } from "@/lib/validations/cleanup-vocabulary"

/** The known added dates of the item: Plex, then the arr app. */
const addedDates = (item: SnapshotItem) => [item.added.plex, item.added.arr].filter((t): t is number => t !== null)

/** True when the arr source failed, so the arr date is missing but may exist. */
const arrDateLost = (item: SnapshotItem, ctx: EvalContext) => item.added.arr === null && ctx.sources[LEVEL_ARR[item.level]] === "failed"

/**
 * The date that decides (E16): for a condition, every date must pass, so the
 * newest for `moreThan` and the oldest for `lessThan`. For a protection, one
 * date is enough, so the other way round.
 */
function decidingDate(item: SnapshotItem, op: ConditionOf<"library.added">["op"], role: "condition" | "protection" = "condition"): number | null {
  const dates = addedDates(item)
  if (dates.length === 0) return null
  return (op === "moreThan") === (role === "condition") ? Math.max(...dates) : Math.min(...dates)
}

export const added: FieldEval<"library.added"> = {
  id: "library.added",
  evaluate(item, c, ctx, role) {
    const dates = addedDates(item)
    const arr = LEVEL_ARR[item.level]
    const lost = arrDateLost(item, ctx)
    if (dates.length === 0) return lost ? sourceFailed(arr) : unknown({ kind: "noValue", what: "date" })
    const days = durationDays(c.value.duration)
    const parts = dates.map((t) => passWhen(datePasses(c.op, t, days, ctx.now)))
    if (lost) parts.push(sourceFailed(arr))
    return role === "condition" ? allOf(parts) : anyOf(parts)
  },
  gap(item, c, ctx) {
    const at = decidingDate(item, c.op)
    return at === null ? null : dateGap(c.op, at, durationDays(c.value.duration), ctx.now)
  },
  forecast(item, c, ctx) {
    const at = decidingDate(item, c.op)
    return at === null || c.op !== "moreThan" ? null : dateForecast(at, durationDays(c.value.duration), ctx)
  },
  tryValue(item, c, ctx) {
    const at = decidingDate(item, c.op)
    const duration = at === null ? null : dateTry(c.op, at, c.value.duration, ctx.now)
    return duration ? { duration } : null
  },
  measure(item, ctx, c, role) {
    const at = c ? decidingDate(item, c.op, role) : newest(addedDates(item))
    return at === null ? null : daysSince(at, ctx.now)
  },
  fact(item, ctx) {
    const at = newest(addedDates(item))
    return phrases(at === null ? "Added date unknown." : `Added ${monthOf(at, ctx)}.`)
  },
}

/** The Why Sheet form of `library.added` (TS 4.5): each known date with its source. */
export function addedSheetFact(item: SnapshotItem, ctx: EvalContext): WhyPart[] {
  const texts: string[] = []
  if (item.added.plex !== null) texts.push(`Added to Plex ${dateOf(item.added.plex, ctx)}.`)
  if (item.added.arr !== null) texts.push(`Added to ${ARR_NAMES[LEVEL_ARR[item.level]]} ${dateOf(item.added.arr, ctx)}.`)
  return phrases(...(texts.length > 0 ? texts : ["Added date unknown."]))
}

const unitBytes = (unit: "GB" | "TB") => (unit === "TB" ? TiB : GiB)
/** The largest size a condition takes (TS 3.2). */
const MAX_BYTES = 50 * TiB

/**
 * One size that includes the item (TS 6.5). `moreThan`: the whole units
 * below the size, in GB when a TB condition's item is under 1 TB, at least
 * 1 GB and at most 50 TB. `lessThan`: the whole units above the size, at
 * most 50 TB.
 */
function sizeTry(s: number, c: ConditionOf<"file.size">): ConditionOf<"file.size">["value"] | null {
  if (c.op === "moreThan") {
    for (const unit of c.value.unit === "TB" ? (["TB", "GB"] as const) : (["GB"] as const)) {
      const amount = Math.ceil(s / unitBytes(unit)) - 1 // the largest whole amount strictly below s
      if (amount >= 1) return { bytes: Math.min(amount * unitBytes(unit), MAX_BYTES), unit }
    }
    return null
  }
  const step = unitBytes(c.value.unit)
  const bytes = (Math.floor(s / step) + 1) * step // the smallest whole amount strictly above s
  return bytes <= MAX_BYTES ? { bytes, unit: c.value.unit } : null
}

export const size: FieldEval<"file.size"> = {
  id: "file.size",
  evaluate(item, c) {
    const s = item.sizeBytes
    if (s === null) return unknown({ kind: "noValue", what: "size" })
    return passWhen(c.op === "moreThan" ? s > c.value.bytes : s < c.value.bytes)
  },
  gap(item, c) {
    const s = item.sizeBytes
    return s === null ? null : Math.round(Math.abs(Math.log2(Math.max(s, 1) / c.value.bytes)) * 100)
  },
  forecast: () => null,
  tryValue: (item, c) => (item.sizeBytes === null ? null : sizeTry(item.sizeBytes, c)),
  measure: (item) => item.sizeBytes,
  fact: (item) => phrases(item.sizeBytes === null ? "Size unknown." : `${formatBytes(item.sizeBytes)}.`),
}
