/**
 * The fact catalogue (design 7.8): every fact a page, a card or the LLM may
 * read, as `{ id, group, unit, format, source, feasibility }`.
 *
 * Indexed facts are expanded, so `series[n].title` is five ids, n = 1 to 5,
 * and {@link FactId} is a closed union of every id. `format` is an example
 * display in en-US (the field guide's sample for P5.8's prompt), `source` the
 * stats module or input the value comes from, and `feasibility` design 4.3's
 * tag: H from the history rows, M from the metadata cache, the aggregate,
 * Overseerr or Sonarr, DB from Rewind's own tables.
 *
 * The catalogue freezes with the prompt on 2026-12-01 (P8.1): after that an
 * id is never renamed or removed, and `CATALOGUE_VERSION` changes with any
 * addition.
 *
 * @module lib/wrapped/facts/catalogue
 */

import { z } from "zod"

import { FACT_UNITS, type FactUnit } from "./display"

export const CATALOGUE_VERSION = "facts-2026.1"

export type FactGroup =
  | "member" | "window" | "time" | "counts" | "days" | "hours" | "series" | "films" | "quiz" | "taste"
  | "people" | "race" | "records" | "setup" | "requests" | "standing" | "archetype" | "next"

export interface FactSpec {
  group: FactGroup
  unit: FactUnit
  format: string
  source: string
  feasibility: "H" | "M" | "DB"
}

type Spec = Omit<FactSpec, "group">
const f = (unit: FactUnit, format: string, source: string, feasibility: FactSpec["feasibility"] = "H"): Spec => ({
  unit,
  format,
  source,
  feasibility,
})

function group<K extends string>(name: FactGroup, specs: Record<K, Spec>): Record<K, FactSpec> {
  return Object.fromEntries(Object.entries<Spec>(specs).map(([id, spec]) => [id, { group: name, ...spec }])) as Record<K, FactSpec>
}

/** `prefix[n].field` for every n and field; a field of `""` gives `prefix[n]`. */
function indexed<P extends string, N extends number, K extends string>(
  name: FactGroup,
  prefix: P,
  ns: readonly N[],
  fields: Record<K, Spec>
): Record<K extends "" ? `${P}[${N}]` : `${P}[${N}].${K}`, FactSpec> {
  const out: Record<string, FactSpec> = {}
  for (const n of ns) {
    for (const [field, spec] of Object.entries<Spec>(fields)) out[field ? `${prefix}[${n}].${field}` : `${prefix}[${n}]`] = { group: name, ...spec }
  }
  return out as Record<K extends "" ? `${P}[${N}]` : `${P}[${N}].${K}`, FactSpec>
}

const ONE_TO_THREE = [1, 2, 3] as const
const ONE_TO_FOUR = [1, 2, 3, 4] as const
const ONE_TO_FIVE = [1, 2, 3, 4, 5] as const
const MONTHS = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const

export const FACTS = {
  ...group("member", {
    "member.firstName": f("name", "Mike", "User.name, first word"),
    "member.volume": f("count", "4", "bookends: years since the first play"),
    "member.serial": f("text", "K7Q4", "HMAC of userId and year", "DB"),
    "member.since": f("year", "2023", "bookends"),
    "member.lifetimeHours": f("hours", "3,940", "bookends"),
    "member.nthRewind": f("count", "4", "completed PlexWrapped rows", "DB"),
  }),
  ...group("window", {
    "window.from": f("date", "January 1", "window"),
    "window.through": f("date", "November 30", "window"),
    "window.finalCut": f("count", "0", "window: 1 after the final cut"),
    "window.elapsedDays": f("days", "334 days", "window"),
    "tz.label": f("text", "America/Chicago", "Rewind zone"),
  }),
  ...group("time", {
    "time.totalMinutes": f("duration", "47 minutes", "totals"),
    "time.totalHours": f("hours", "1,307", "totals"),
    "time.daysHours": f("days-hours", "54 days, 11 hours", "totals"),
    "time.perDay": f("duration", "3 h 54 m", "totals"),
    "time.seriesHours": f("hours", "872", "totals"),
    "time.seriesShare": f("share", "67%", "totals"),
    "time.filmsHours": f("hours", "435", "totals"),
    "time.filmsShare": f("share", "33%", "totals"),
    "time.vsLastYear": f("change", "+18%", "totals over last year's window"),
    "time.liveHours": f("hours", "12", "totals"),
  }),
  ...indexed("time", "time.milestones", ONE_TO_FOUR, {
    hours: f("hours", "1,000", "milestones"),
    date: f("date", "October 2", "milestones"),
  }),
  ...group("counts", {
    "counts.episodes": f("count", "586", "totals"),
    "counts.series": f("count", "31", "totals"),
    "counts.films": f("count", "112", "totals"),
    "counts.seasons": f("count", "70", "totals"),
    "counts.titles": f("count", "143", "titles: films and series"),
    "counts.titlesPer10Hours": f("decimal", "1.1", "titles"),
  }),
  ...group("days", {
    "days.active": f("count", "289", "calendar"),
    "days.biggest.date": f("date", "July 4", "calendar"),
    "days.biggest.minutes": f("duration", "12 h 24 m", "calendar"),
    "days.longestGap.days": f("days", "9 days", "calendar"),
    "days.longestGap.month": f("month", "May", "calendar"),
    "streak.longest.days": f("days", "23 days", "calendar"),
    "streak.longest.from": f("date", "March 2", "calendar"),
    "streak.longest.to": f("date", "March 24", "calendar"),
    "days.biggestWeek": f("duration", "41 h 10 m", "sessions"),
    "days.biggestWeek.from": f("date", "July 27", "sessions"),
    "days.biggestWeek.median": f("duration", "12 h", "aggregate.medians", "M"),
  }),
  ...group("hours", {
    "hours.peak": f("hour", "10 PM", "time"),
    "hours.quietest": f("hour", "5 AM", "time"),
    "hours.afterDarkShare": f("share", "34%", "time: started 10 PM to 4 AM"),
    "hours.goldenShare": f("share", "41%", "time: started 6 PM to 10 PM"),
    "hours.medianStart": f("time", "9:40 PM", "time"),
    "hours.latestStart.time": f("time", "2:47 AM", "time"),
    "hours.latestStart.weekday": f("weekday", "Sunday", "time"),
    "days.weekendShare": f("share", "38%", "time"),
  }),
  ...indexed("series", "series", ONE_TO_FIVE, {
    title: f("title", "Severance", "titles"),
    minutes: f("duration", "20 h 10 m", "titles"),
    episodes: f("count", "19", "titles"),
    seasons: f("count", "2", "titles"),
    monthsActive: f("count", "9", "titles"),
    rewatched: f("times", "watched twice", "titles"),
    "biggestNight.date": f("date", "October 6", "sessions"),
    "biggestNight.episodes": f("count", "4", "sessions"),
    viewerRank: f("rank", "#1", "community", "M"),
    viewerCount: f("count", "6", "community", "M"),
  }),
  ...group("series", { "series.top3Share": f("share", "48%", "titles") }),
  ...indexed("films", "films", ONE_TO_FIVE, {
    title: f("title", "Dune: Part Two", "titles"),
    plays: f("count", "2", "titles"),
    minutes: f("duration", "5 h 32 m", "titles"),
  }),
  ...group("films", {
    "films.finishedShare": f("share", "94%", "titles"),
    "films.longest.title": f("title", "Oppenheimer", "titles and the cache's runtime", "M"),
    "films.longest.minutes": f("duration", "3 h", "titles and the cache's runtime", "M"),
  }),
  ...group("quiz", { "quiz.gapMinutes": f("duration", "50 minutes", "titles: No. 1 minus No. 2") }),
  ...indexed("taste", "taste.genre", ONE_TO_FIVE, {
    name: f("text", "Drama", "taste", "M"),
    share: f("share", "31%", "taste", "M"),
  }),
  ...indexed("taste", "taste.genreByMonth", MONTHS, { "": f("text", "Drama", "taste", "M") }),
  ...group("taste", {
    "taste.medianYear": f("year", "2022", "taste", "M"),
    "taste.oldest.title": f("title", "Casablanca", "taste", "M"),
    "taste.oldest.year": f("year", "1942", "taste", "M"),
    "taste.freshShare": f("share", "12%", "taste: started within 14 days of release"),
  }),
  ...indexed("people", "people.actor", ONE_TO_FIVE, {
    name: f("name", "Adam Scott", "people", "M"),
    minutes: f("duration", "20 h 10 m", "people", "M"),
  }),
  ...indexed("people", "people.director", ONE_TO_THREE, { name: f("name", "Denis Villeneuve", "people", "M") }),
  ...indexed("race", "race.leader", MONTHS, { "": f("title", "Severance", "race") }),
  ...group("race", {
    "race.leadChanges": f("count", "1", "race"),
    "race.overtakeMonth": f("month", "November", "race"),
    "race.closestGapMinutes": f("duration", "50 minutes", "race"),
  }),
  ...group("records", {
    "records.longestBinge.episodes": f("count", "6", "sessions"),
    "records.longestBinge.title": f("title", "Severance", "sessions"),
    "records.longestBinge.date": f("date", "February 14", "sessions"),
    "records.longestBinge.median": f("count", "3", "aggregate.medians", "M"),
    "records.deepestBinge.episodes": f("count", "9", "sessions"),
    "records.deepestBinge.title": f("title", "Shogun", "sessions"),
    "records.deepestBinge.median": f("count", "4", "aggregate.medians", "M"),
    "records.mostEpisodesDay": f("count", "11", "sessions"),
    "records.mostEpisodesDay.median": f("count", "4", "aggregate.medians", "M"),
    "records.completionShare": f("share", "91%", "titles"),
    "records.completionShare.median": f("share", "84%", "aggregate.medians", "M"),
    "records.mostPaused.title": f("title", "Slow Horses", "sessions"),
    "records.mostPaused.median": f("duration", "40 minutes", "aggregate.medians", "M"),
    "records.rewatchShare": f("share", "8%", "titles"),
    "records.rewatchedTitles": f("count", "5", "titles"),
  }),
  ...group("setup", {
    "setup.directPlayShare": f("share", "92%", "devices"),
    "setup.homeShare": f("share", "81%", "devices"),
    "setup.topPlatform": f("text", "Apple TV", "devices"),
    "setup.topProduct": f("text", "Plex for Android", "devices"),
    "setup.fourKShare": f("share", "22%", "devices and the cache", "M"),
  }),
  ...group("requests", {
    "requests.made": f("count", "27", "requests", "M"),
    "requests.approved": f("count", "24", "requests", "M"),
    "requests.available": f("count", "21", "requests", "M"),
    "requests.pending": f("count", "2", "requests", "M"),
    "requests.declined": f("count", "1", "requests", "M"),
    "requests.watched": f("count", "15", "requests", "M"),
  }),
  ...indexed("requests", "requests.genre", ONE_TO_THREE, { "": f("text", "Science Fiction", "requests", "M") }),
  ...group("standing", {
    "standing.percentile": f("percentile", "Top 3%", "community", "M"),
    "standing.members": f("count", "31", "community", "M"),
    "community.hours": f("hours", "21,400", "community", "M"),
    "community.topSeries": f("title", "Severance", "community", "M"),
    "community.busiestNight": f("date", "December 24", "community", "M"),
    "community.peakConcurrent": f("count", "7", "community", "M"),
    "community.requestsFulfilled": f("count", "212", "community", "M"),
    "community.titlesAdded": f("count", "640", "community", "M"),
  }),
  ...group("archetype", {
    "archetype.id": f("id", "midnight-marathoner", "select"),
    "archetype.name": f("name", "The Midnight Marathoner", "select"),
    "archetype.runnerUp": f("name", "The Series Devourer", "select"),
    "archetype.rarityCount": f("count", "6", "aggregate.archetypeCounts", "M"),
    "archetype.rarityShare": f("share", "19%", "aggregate.archetypeCounts", "M"),
    "archetype.scoredMembers": f("count", "31", "aggregate.scoredMembers", "M"),
  }),
  ...indexed("archetype", "archetype.evidence", ONE_TO_THREE, { "": f("text", "34%", "select: an evidence fact's display") }),
  ...indexed("next", "next.leftForLater", ONE_TO_THREE, { title: f("title", "Severance", "next-year", "M") }),
  ...indexed("next", "next.returning", ONE_TO_THREE, {
    title: f("title", "Severance", "Sonarr, from P7.2", "M"),
    date: f("date", "January 16", "Sonarr, from P7.2", "M"),
  }),
  ...indexed("next", "next.picks", ONE_TO_THREE, { title: f("title", "Arrival", "next-year", "M") }),
}

/** Every fact id: a closed union. */
export type FactId = keyof typeof FACTS

export const FACT_IDS = Object.keys(FACTS) as [FactId, ...FactId[]]

export const FactIdSchema = z.enum(FACT_IDS)

/**
 * A member's facts (design 7.8): display strings plus raw values. A member
 * never has every fact; an ineligible one is absent, never null.
 */
export const RewindFactsV3Schema = z.partialRecord(
  FactIdSchema,
  z.strictObject({
    value: z.union([z.number(), z.string(), z.null()]),
    display: z.string(),
    unit: z.enum(FACT_UNITS),
  })
)

export type RewindFactsV3 = z.infer<typeof RewindFactsV3Schema>
