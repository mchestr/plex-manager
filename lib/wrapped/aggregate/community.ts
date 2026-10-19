/**
 * The server's community facts (design 7.4): pure functions over every
 * viewer's plays, already trimmed to that viewer's own window.
 *
 * A fact derived from viewers carries `contributors`, the distinct viewers
 * behind it, and is null below {@link MIN_CONTRIBUTORS}, so no fact can point
 * at one or two people. `titlesAdded` comes from the library and has no
 * contributor rule.
 *
 * @module lib/wrapped/aggregate/community
 */

import type { LibraryItem } from "@/lib/wrapped/sources/plex-library"
import type { RequestEvent } from "@/lib/wrapped/sources/request-event"
import { inWindow, dayKey, type TimeWindow } from "@/lib/wrapped/time/zone"
import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import { MIN_CONTRIBUTORS, type CommunityFacts } from "./schema"

/** One viewer's plays: a member, or an unmatched Tautulli user. */
export interface ViewerPlays {
  viewerId: string
  events: readonly PlayEvent[]
}

const minutesOf = (seconds: number) => Math.floor(seconds / 60)
const enough = (contributors: number) => contributors >= MIN_CONTRIBUTORS

function hours(viewers: readonly ViewerPlays[]): CommunityFacts["hours"] {
  let seconds = 0
  let contributors = 0
  for (const viewer of viewers) {
    const own = viewer.events.reduce((sum, e) => sum + e.playSeconds, 0)
    seconds += own
    if (own > 0) contributors++
  }
  return enough(contributors) ? { value: Math.floor(minutesOf(seconds) / 60), contributors } : null
}

/** The series with the most minutes; plays kept out of lists never count. */
function topSeries(viewers: readonly ViewerPlays[]): CommunityFacts["topSeries"] {
  const series = new Map<string, { title: string; seconds: number; viewers: Set<string> }>()
  for (const viewer of viewers) {
    for (const e of viewer.events) {
      if (e.mediaType !== "episode" || !e.grandparentRatingKey || e.excludedFromLists) continue
      const entry = series.get(e.grandparentRatingKey) ?? { title: e.grandparentTitle ?? e.title, seconds: 0, viewers: new Set() }
      entry.seconds += e.playSeconds
      entry.viewers.add(viewer.viewerId)
      series.set(e.grandparentRatingKey, entry)
    }
  }
  const top = [...series].filter(([, s]) => enough(s.viewers.size)).sort(([, a], [, b]) => b.seconds - a.seconds)[0]
  if (!top) return null
  const [grandparentRatingKey, { title, seconds, viewers: who }] = top
  return { grandparentRatingKey, title, minutes: minutesOf(seconds), contributors: who.size }
}

/** The day, in the server zone, with the most minutes started. */
function busiestNight(viewers: readonly ViewerPlays[], zone: string): CommunityFacts["busiestNight"] {
  const days = new Map<string, { seconds: number; viewers: Set<string> }>()
  for (const viewer of viewers) {
    for (const e of viewer.events) {
      const day = dayKey(e.startedAt, zone)
      const entry = days.get(day) ?? { seconds: 0, viewers: new Set() }
      entry.seconds += e.playSeconds
      entry.viewers.add(viewer.viewerId)
      days.set(day, entry)
    }
  }
  const top = [...days].filter(([, d]) => enough(d.viewers.size)).sort(([, a], [, b]) => b.seconds - a.seconds)[0]
  return top ? { day: top[0], minutes: minutesOf(top[1].seconds), contributors: top[1].viewers.size } : null
}

/** A viewer's play intervals with overlaps merged, so two streams at once count as one viewer. */
function mergedIntervals(events: readonly PlayEvent[]): Array<[number, number]> {
  const sorted = events.filter((e) => e.stoppedAt > e.startedAt).map((e) => [e.startedAt, e.stoppedAt] as [number, number])
  sorted.sort((a, b) => a[0] - b[0])
  const merged: Array<[number, number]> = []
  for (const [start, end] of sorted) {
    const last = merged.at(-1)
    if (last && start <= last[1]) last[1] = Math.max(last[1], end)
    else merged.push([start, end])
  }
  return merged
}

/**
 * The most distinct viewers watching at one instant: a sweep over each
 * viewer's merged `[startedAt, stoppedAt)` intervals. At a tie an end is
 * taken before a start, so back-to-back plays do not overlap.
 */
function peakConcurrent(viewers: readonly ViewerPlays[]): CommunityFacts["peakConcurrent"] {
  const edges: Array<[number, 1 | -1]> = []
  for (const viewer of viewers) {
    for (const [start, end] of mergedIntervals(viewer.events)) edges.push([start, 1], [end, -1])
  }
  edges.sort((a, b) => a[0] - b[0] || a[1] - b[1])
  let current = 0
  let peak = { value: 0, at: 0 }
  for (const [at, delta] of edges) {
    current += delta
    if (current > peak.value) peak = { value: current, at }
  }
  return enough(peak.value) ? { ...peak, contributors: peak.value } : null
}

/** Requests created in the window that were approved and are on the server. */
function requestsFulfilled(requests: readonly RequestEvent[] | null, window: TimeWindow): CommunityFacts["requestsFulfilled"] {
  if (!requests) return null
  const fulfilled = requests.filter((r) => r.available && inWindow(r.createdAt, window))
  const contributors = new Set(fulfilled.flatMap((r) => (r.requestedById === null ? [] : [r.requestedById]))).size
  return enough(contributors) ? { value: fulfilled.length, contributors } : null
}

function titlesAdded(items: readonly LibraryItem[], window: TimeWindow): CommunityFacts["titlesAdded"] {
  const added = items.filter((item) => item.addedAt !== null && inWindow(item.addedAt, window))
  const films = added.filter((item) => item.type === "movie").length
  const series = added.filter((item) => item.type === "show").length
  return { total: films + series, films, series }
}

/** Every community fact, for viewers already trimmed to their own windows. */
export function computeCommunity(input: {
  viewers: readonly ViewerPlays[]
  serverWindow: TimeWindow
  serverRequests: readonly RequestEvent[] | null
  libraryItems: readonly LibraryItem[]
}): CommunityFacts {
  const { viewers, serverWindow } = input
  return {
    hours: hours(viewers),
    topSeries: topSeries(viewers),
    busiestNight: busiestNight(viewers, serverWindow.zone),
    peakConcurrent: peakConcurrent(viewers),
    requestsFulfilled: requestsFulfilled(input.serverRequests, serverWindow),
    titlesAdded: titlesAdded(input.libraryItems, serverWindow),
  }
}
