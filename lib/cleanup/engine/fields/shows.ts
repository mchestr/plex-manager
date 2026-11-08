/**
 * Show and season fields (TS 4.2, 4.3): `show.status`,
 * `show.lastEpisodeAdded`, `show.seasonsOnDisk` and `season.position`.
 * A season item carries its show's Sonarr facts in `item.show`, with its own
 * newest episode date (TS 7.5). `position` and `seasonsOnDisk` use Sonarr
 * season numbers. Client-safe.
 *
 * @module lib/cleanup/engine/fields/shows
 */

import { counted, FAIL, monthOf, needsCheck, passWhen, phrases, sourceFailed, unknown } from "@/lib/cleanup/engine/fields/shared"
import { dateForecast, dateGap, datePasses, dateTry, daysSince } from "@/lib/cleanup/engine/fields/time"
import type { EvalContext, FieldEval, FieldVerdict } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { durationDays } from "@/lib/validations/cleanup-rule"
import { FIELD_NEEDS } from "@/lib/validations/cleanup-vocabulary"

const STATUS_WORDS = { ended: "Ended.", continuing: "Continuing.", upcoming: "Upcoming.", deleted: "Deleted." } as const
const unordered = { gap: () => null, forecast: () => null, tryValue: () => null, measure: () => null }

export const status: FieldEval<"show.status"> = {
  id: "show.status",
  evaluate(item, c, ctx) {
    const down = needsCheck(ctx, FIELD_NEEDS["show.status"])
    if (down) return down
    const value = item.show?.status ?? null
    // No Sonarr record: the item is not matched, and no failed service is the cause.
    if (value === null) return unknown()
    return passWhen(value === c.value.status) // upcoming and deleted fail both values
  },
  ...unordered,
  fact(item) {
    const value = item.show?.status ?? null
    return phrases(value === null ? "Status unknown." : STATUS_WORDS[value])
  },
}

/** The newest episode date: the show's, or the season's own for a season item. */
function lastAdded(item: SnapshotItem, ctx: EvalContext): { at: number } | { verdict: FieldVerdict } {
  const at = item.show?.lastEpisodeAddedAt ?? null
  if (at !== null) return { at }
  // Sonarr failed: the snapshot drops the whole show object, the Plex date with it (TS 7.8).
  if (item.show === null && ctx.sources.sonarr === "failed") return { verdict: sourceFailed("sonarr") }
  return { verdict: unknown({ kind: "noValue", what: "date" }) }
}

export const lastEpisodeAdded: FieldEval<"show.lastEpisodeAdded"> = {
  id: "show.lastEpisodeAdded",
  evaluate(item, c, ctx) {
    const read = lastAdded(item, ctx)
    if ("verdict" in read) return read.verdict
    return passWhen(datePasses(c.op, read.at, durationDays(c.value.duration), ctx.now))
  },
  gap(item, c, ctx) {
    const read = lastAdded(item, ctx)
    return "verdict" in read ? null : dateGap(c.op, read.at, durationDays(c.value.duration), ctx.now)
  },
  forecast(item, c, ctx) {
    const read = lastAdded(item, ctx)
    return "verdict" in read || c.op !== "moreThan" ? null : dateForecast(read.at, durationDays(c.value.duration), ctx)
  },
  tryValue(item, c, ctx) {
    const read = lastAdded(item, ctx)
    const duration = "verdict" in read ? null : dateTry(c.op, read.at, c.value.duration, ctx.now)
    return duration ? { duration } : null
  },
  measure(item, ctx) {
    const read = lastAdded(item, ctx)
    return "verdict" in read ? null : daysSince(read.at, ctx.now)
  },
  fact(item, ctx) {
    if (!item.show) return []
    const at = item.show.lastEpisodeAddedAt
    return phrases(at === null ? "No episode in Plex." : `Last episode added ${monthOf(at, ctx)}.`)
  },
}

const seasonCount = (item: SnapshotItem) => item.show?.seasonsOnDisk ?? null

export const seasonsOnDisk: FieldEval<"show.seasonsOnDisk"> = {
  id: "show.seasonsOnDisk",
  evaluate(item, c, ctx) {
    const down = needsCheck(ctx, FIELD_NEEDS["show.seasonsOnDisk"])
    if (down) return down
    const n = seasonCount(item)
    if (n === null) return unknown()
    return passWhen(c.op === "atLeast" ? n >= c.value.count : n < c.value.count)
  },
  gap(item, c) {
    const n = seasonCount(item)
    return n === null ? null : Math.abs(n - c.value.count)
  },
  forecast: () => null,
  tryValue(item, c) {
    const n = seasonCount(item)
    return n === null || c.op !== "atLeast" ? null : { count: Math.min(100, Math.max(1, n)) }
  },
  measure: () => null,
  fact(item) {
    const n = seasonCount(item)
    return n === null ? [] : phrases(`${counted(n, "season", "seasons")} on disk.`)
  },
}

const SUFFIXES: Partial<Record<number, string>> = { 1: "st", 2: "nd", 3: "rd" }

/** @internal "1st", "2nd", "3rd", "4th", "11th", "21st"; exported for the tests. */
export function ordinal(n: number): string {
  const teen = n % 100 >= 11 && n % 100 <= 13
  return `${n}${teen ? "th" : (SUFFIXES[n % 10] ?? "th")}`
}

/** The season's position (1 is the newest on disk), or null for a season with no number. */
const positionOf = (item: SnapshotItem) => (item.seasonNumber === null ? null : item.position)

export const position: FieldEval<"season.position"> = {
  id: "season.position",
  evaluate(item, c, ctx) {
    const down = needsCheck(ctx, FIELD_NEEDS["season.position"])
    if (down) return down
    const p = positionOf(item)
    if (p === null) return FAIL // a season with no number fails both operators
    return passWhen(c.op === "notNewest" ? p > c.value.count : p <= c.value.count)
  },
  gap(item, c) {
    const p = positionOf(item)
    return p === null ? null : Math.abs(p - c.value.count)
  },
  forecast: () => null,
  tryValue(item, c) {
    const p = positionOf(item)
    return p === null || c.op !== "notNewest" || p - 1 < 1 ? null : { count: Math.min(20, p - 1) }
  },
  measure: () => null,
  fact(item) {
    const p = positionOf(item)
    if (p === null) return phrases("No season number.")
    return phrases(p === 1 ? "The newest season." : `${ordinal(p)} newest season.`)
  },
}
