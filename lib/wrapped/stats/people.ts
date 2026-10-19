/**
 * The people page's facts (page 08): who was on screen most.
 *
 * - Actors are weighted by the minutes watched: every credited actor of a
 *   title (the cache keeps the first ten, in billing order) earns all of its
 *   minutes. An episode counts through its series' cast.
 * - Directors come from films only, weighted the same way.
 * - Only listed plays count, and the page is ineligible when fewer than 70%
 *   of their minutes have cast or director metadata.
 *
 * Names only: no ids, headshots or roles.
 *
 * @module lib/wrapped/stats/people
 */

import type { PlayEvent } from "@/lib/wrapped/sources/watch-history-source"

import { isListed, minutesOf, videoEvents, type StatsContext } from "./keys"
import { coverage, type MetadataLookup } from "./metadata"

const MIN_COVERAGE = 0.7
const TOP_ACTORS = 5
const TOP_DIRECTORS = 3

export interface Person {
  name: string
  minutes: number
}

export type PeopleStats =
  | { eligible: false; coverage: number }
  | { eligible: true; coverage: number; actors: Person[]; directors: Person[] }

function ranked(seconds: ReadonlyMap<string, number>, limit: number): Person[] {
  return [...seconds]
    .sort(([a, x], [b, y]) => y - x || (a < b ? -1 : 1))
    .slice(0, limit)
    .map(([name, s]) => ({ name, minutes: minutesOf(s) }))
}

function add(seconds: Map<string, number>, names: readonly string[], amount: number): void {
  for (const name of new Set(names)) seconds.set(name, (seconds.get(name) ?? 0) + amount)
}

/**
 * @example
 * ```ts
 * const people = computePeople(events, ctx, lookup)
 * if (people.eligible) people.directors.map((d) => d.name) // ["Denis Villeneuve", ...]
 * ```
 */
export function computePeople(events: readonly PlayEvent[], ctx: StatsContext, lookup: MetadataLookup): PeopleStats {
  const listed = videoEvents(events).filter((e) => isListed(e, ctx))
  const covered = coverage(listed, (e) => {
    const metadata = lookup(e)
    return !!metadata && (metadata.actors.length > 0 || (e.mediaType === "movie" && metadata.directors.length > 0))
  })
  if (covered < MIN_COVERAGE) return { eligible: false, coverage: covered }

  const actors = new Map<string, number>()
  const directors = new Map<string, number>()
  for (const e of listed) {
    const metadata = lookup(e)
    if (!metadata) continue
    add(actors, metadata.actors, e.playSeconds)
    if (e.mediaType === "movie") add(directors, metadata.directors, e.playSeconds)
  }
  return { eligible: true, coverage: covered, actors: ranked(actors, TOP_ACTORS), directors: ranked(directors, TOP_DIRECTORS) }
}
