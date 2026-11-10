/**
 * Watching fields (TS 4.2, 4.3): `watch.lastPlayed` and `watch.plays`. Plays
 * are counted plays (E15), already summed over every Plex copy, every
 * episode of a show or every episode of a season by the snapshot (TS 7.5).
 *
 * X2: no history row means "never" since the history start. Unknown comes
 * only from a failed Tautulli or an unknown history start. Client-safe.
 *
 * @module lib/cleanup/engine/fields/watch
 */

import { counted, dateOf, FAIL, monthOf, needsCheck, passWhen, phrases, sourceFailed, unknown } from "@/lib/cleanup/engine/fields/shared"
import { dateForecast, dateGap, datePasses, dateTry, daysSince, within } from "@/lib/cleanup/engine/fields/time"
import type { EvalContext, FieldEval, FieldVerdict, WhyPart } from "@/lib/cleanup/engine/types"
import type { SnapshotItem } from "@/lib/cleanup/schema/snapshot"
import { type ConditionOf, type Duration, durationDays } from "@/lib/validations/cleanup-rule"
import { FIELD_NEEDS } from "@/lib/validations/cleanup-vocabulary"

type Plays = NonNullable<SnapshotItem["plays"]>
type PlayWindow = ConditionOf<"watch.plays">["value"]["window"]

/** The plays of the item, or the unknown verdict when Tautulli failed or is not set up. */
function readPlays(item: SnapshotItem, ctx: EvalContext): { plays: Plays } | { verdict: FieldVerdict } {
  const down = needsCheck(ctx, FIELD_NEEDS["watch.plays"])
  if (down) return { verdict: down }
  return item.plays ? { plays: item.plays } : { verdict: sourceFailed("tautulli") }
}

/** `plays.lastCountedAt`, or the unknown verdict: Tautulli failed, or the history start is unknown (X2). */
function readLastPlayed(item: SnapshotItem, ctx: EvalContext): { at: number | null } | { verdict: FieldVerdict } {
  const read = readPlays(item, ctx)
  if ("verdict" in read) return read
  if (ctx.history.startAt === null) return { verdict: unknown({ kind: "noValue", what: "history" }) }
  return { at: read.plays.lastCountedAt }
}

/** @internal `{amount} {unit}`, with the unit singular at 1: "1 year", "365 days" (TS 4.2); exported for the tests. */
export function durationWords(d: Duration): string {
  return `${d.amount} ${d.amount === 1 ? d.unit.slice(0, -1) : d.unit}`
}

export const lastPlayed: FieldEval<"watch.lastPlayed"> = {
  id: "watch.lastPlayed",
  evaluate(item, c, ctx) {
    const read = readLastPlayed(item, ctx)
    if ("verdict" in read) return read.verdict
    if (c.op === "never") return passWhen(read.at === null)
    if (read.at === null) return c.op === "moreThan" ? passWhen(c.value.orNever) : FAIL
    return passWhen(datePasses(c.op, read.at, durationDays(c.value.duration), ctx.now))
  },
  gap(item, c, ctx) {
    const read = readLastPlayed(item, ctx)
    if ("verdict" in read || read.at === null || c.op === "never") return null
    return dateGap(c.op, read.at, durationDays(c.value.duration), ctx.now)
  },
  forecast(item, c, ctx) {
    const read = readLastPlayed(item, ctx)
    if ("verdict" in read || read.at === null || c.op !== "moreThan") return null
    return dateForecast(read.at, durationDays(c.value.duration), ctx)
  },
  tryValue(item, c, ctx) {
    const read = readLastPlayed(item, ctx)
    if ("verdict" in read || read.at === null || c.op === "never") return null
    const duration = dateTry(c.op, read.at, c.value.duration, ctx.now)
    return duration ? { duration, orNever: c.value.orNever } : null
  },
  measure(item, ctx) {
    const read = readLastPlayed(item, ctx)
    return "verdict" in read || read.at === null ? null : daysSince(read.at, ctx.now)
  },
  fact(item, ctx) {
    if (!item.plays) return []
    const at = item.plays.lastCountedAt
    return phrases(at === null ? "Never played." : `Last played ${monthOf(at, ctx)}.`)
  },
}

/** The Why Sheet form of `watch.lastPlayed` (TS 4.5): the full date, and the history start for "never". */
export function lastPlayedSheetFact(item: SnapshotItem, ctx: EvalContext): WhyPart[] {
  if (!item.plays) return []
  const at = item.plays.lastCountedAt
  if (at !== null) return phrases(`Last played ${dateOf(at, ctx)}.`)
  const start = ctx.history.startAt
  if (start === null) return phrases("Never played.")
  return phrases("Never played.", `No counted play since Tautulli history starts on ${dateOf(start, ctx)}.`)
}

/** The counted plays in the window: every one in total, or those less than N days ago. */
function playCount(plays: Plays, window: PlayWindow, now: number): number {
  if (window.kind === "total") return plays.countedAt.length
  const days = durationDays(window.duration)
  return plays.countedAt.filter((at) => within(at, days, now)).length
}

export const plays: FieldEval<"watch.plays"> = {
  id: "watch.plays",
  evaluate(item, c, ctx) {
    const read = readPlays(item, ctx)
    if ("verdict" in read) return read.verdict
    const n = playCount(read.plays, c.value.window, ctx.now)
    return passWhen(c.op === "fewerThan" ? n < c.value.count : n >= c.value.count)
  },
  gap(item, c, ctx) {
    const read = readPlays(item, ctx)
    if ("verdict" in read) return null
    return Math.abs(playCount(read.plays, c.value.window, ctx.now) - c.value.count) + 1
  },
  forecast: () => null,
  tryValue(item, c, ctx) {
    const read = readPlays(item, ctx)
    if ("verdict" in read) return null
    const n = playCount(read.plays, c.value.window, ctx.now)
    if (c.op === "fewerThan") return n + 1 <= 1000 ? { count: n + 1, window: c.value.window } : null
    return n === 0 ? null : { count: n, window: c.value.window }
  },
  measure: () => null,
  fact(item) {
    if (!item.plays) return []
    const n = item.plays.countedAt.length
    return phrases(n === 0 ? "No counted play." : `${counted(n, "play", "plays")} in total.`)
  },
}

/** The `watch.plays` fact for the condition's window (TS 4.5): "{n} plays in the last {N}.", or the total. */
export function playsWindowFact(item: SnapshotItem, c: ConditionOf<"watch.plays">, ctx: EvalContext): WhyPart[] {
  const window = c.value.window
  if (!item.plays || window.kind === "total") return plays.fact(item, ctx)
  const n = playCount(item.plays, window, ctx.now)
  return phrases(n === 0 ? "No counted play." : `${counted(n, "play", "plays")} in the last ${durationWords(window.duration)}.`)
}
