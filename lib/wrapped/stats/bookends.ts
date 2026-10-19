/**
 * The bookends page's facts (page 03): the first and last counted plays of
 * the window, and how long the member has watched on the server.
 *
 * Only listed titles open or close the year, since the page names them.
 * `member.nthRewind` is not a history fact; P5.9 reads it from the database.
 *
 * @module lib/wrapped/stats/bookends
 */

import { zonedParts } from "@/lib/utils/zoned-time"
import { isCountedPlay, type PlayEvent } from "@/lib/wrapped/sources/watch-history-source"
import { dayKey } from "@/lib/wrapped/time/zone"

import { isListed, minutesOf, titleKey, videoEvents, type StatsContext, type TitleKey } from "./keys"
import { rankTitles } from "./rank"

interface Bookend {
  key: TitleKey
  title: string
  /** The day and wall-clock time the play started, in the member's zone. */
  date: string
  hour: number
  minute: number
}

export interface Bookends {
  first: Bookend | null
  last: Bookend | null
  /** Both bookends are the same title on the same day, so the page omits itself. */
  sameTitleSameDay: boolean
  member: {
    /** The day of the member's first play on the server; null without the lifetime pass. */
    since: string | null
    lifetimeHours: number | null
  }
}

/**
 * @param lifetime - All of the member's plays, from the lifetime pass.
 *
 * @example
 * ```ts
 * computeBookends(events, ctx, lifetime).member // { since: "2023-02-11", lifetimeHours: 3940 }
 * ```
 */
export function computeBookends(events: readonly PlayEvent[], ctx: StatsContext, lifetime?: readonly PlayEvent[]): Bookends {
  const titles = new Map(rankTitles(events, ctx).map((t) => [t.key, t.title]))
  const plays = videoEvents(events)
    .filter((e) => isCountedPlay(e) && isListed(e, ctx))
    .sort((a, b) => a.startedAt - b.startedAt)
  const bookend = (e: PlayEvent | undefined): Bookend | null => {
    if (!e) return null
    const key = titleKey(e)!
    const { hour, minute } = zonedParts(e.startedAt, ctx.zone)
    return { key, title: titles.get(key)!, date: dayKey(e.startedAt, ctx.zone), hour, minute }
  }
  const first = bookend(plays[0])
  const last = bookend(plays.at(-1))

  const allTime = lifetime ? videoEvents(lifetime) : null
  const earliest = allTime?.reduce((min, e) => Math.min(min, e.startedAt), Infinity) ?? Infinity
  const lifetimeSeconds = allTime?.reduce((sum, e) => sum + e.playSeconds, 0) ?? 0

  return {
    first,
    last,
    sameTitleSameDay: first !== null && last !== null && first.key === last.key && first.date === last.date,
    member: {
      since: Number.isFinite(earliest) ? dayKey(earliest, ctx.zone) : null,
      lifetimeHours: allTime ? Math.floor(minutesOf(lifetimeSeconds) / 60) : null,
    },
  }
}
