/**
 * The copy slots: every piece of Rewind text a model may write (design 8.3,
 * D2), with what it may cite and what its claim depends on.
 *
 * ## Fields
 *
 * - `maxChars`: the rendered length cap, counting each token at its display
 *   length (decks 140, tagline 70, dedication 240, sign-off 120).
 * - `allowedFacts`: the only facts its tokens may name. A deck leaves out its
 *   page's hero fact ({@link HERO_FACTS}), so it adds context instead of
 *   repeating the number (RWV-10).
 * - `identity`: the facts its claim depends on, such as the No. 1 title. A
 *   slot that may refer to the open data window lists `window.finalCut`.
 * - `bands`: thresholds a quantifier depends on ("most" needs a share of 0.5).
 *
 * ## Dependency hash
 *
 * `slotDependencyHash` hashes the identity values and the side of each band.
 * The final cut and no-LLM regenerations (P7.7, P8.5) re-write a slot only
 * when that hash changes: numbers that merely grew re-render through tokens
 * for free.
 *
 * @module lib/wrapped/copy/slots
 */

import { sha256Hex } from "@/lib/utils/sha256"

import type { IssuePageType } from "@/lib/rewind/registry"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import { canonicalJson } from "@/lib/wrapped/facts/hash"

export const DECK_SLOT_IDS = [
  "deck.number", "deck.bookends", "deck.topShows", "deck.topFilms", "deck.taste", "deck.people",
  "deck.clock", "deck.calendar", "deck.records", "deck.requests", "deck.standing", "deck.nextYear",
] as const

export const SLOT_IDS = [...DECK_SLOT_IDS, "archetype.tagline", "archetype.dedication", "archetype.posterLineId", "signOff"] as const

export type SlotId = (typeof SLOT_IDS)[number]

/** A threshold a quantifier depends on; its side is how many of `at` the value reaches. */
export interface Band {
  fact: FactId
  at: readonly number[]
}

export interface CopySlot {
  id: SlotId
  page: IssuePageType
  maxChars: number
  allowedFacts: readonly FactId[]
  identity: readonly FactId[]
  bands: readonly Band[]
}

const DECK = 140
const n5 = [1, 2, 3, 4, 5] as const
const n3 = [1, 2, 3] as const

/** Each deck page's hero facts: the number or name the page already sets large. */
export const HERO_FACTS: Readonly<Partial<Record<IssuePageType, readonly FactId[]>>> = {
  number: ["time.totalHours", "time.totalMinutes"],
  "top-shows": ["series[1].minutes"],
  "top-films": ["films[1].minutes"],
  taste: ["taste.genre[1].share", "taste.medianYear"],
  people: ["people.actor[1].minutes"],
  clock: ["hours.peak"],
  calendar: ["streak.longest.days"],
  records: ["records.longestBinge.episodes", "records.mostEpisodesDay", "records.deepestBinge.episodes"],
  requests: ["requests.made", "requests.watched", "requests.declined"],
  standing: ["standing.percentile"],
}

const slot = (id: SlotId, page: IssuePageType, maxChars: number, spec: Omit<CopySlot, "id" | "page" | "maxChars">): CopySlot => ({
  id,
  page,
  maxChars,
  ...spec,
})

export const COPY_SLOTS: Readonly<Record<SlotId, CopySlot>> = {
  "deck.number": slot("deck.number", "number", DECK, {
    allowedFacts: [
      "time.daysHours", "time.perDay", "time.seriesHours", "time.seriesShare", "time.filmsHours", "time.filmsShare",
      "time.vsLastYear", "counts.episodes", "counts.series", "counts.films", "window.elapsedDays",
    ],
    identity: ["window.finalCut"],
    bands: [{ fact: "time.seriesShare", at: [0.5] }],
  }),
  "deck.bookends": slot("deck.bookends", "bookends", DECK, {
    allowedFacts: ["member.since", "member.lifetimeHours", "member.nthRewind", "member.volume"],
    identity: ["member.since"],
    bands: [],
  }),
  "deck.topShows": slot("deck.topShows", "top-shows", DECK, {
    allowedFacts: [
      ...n5.map((n) => `series[${n}].title` as const),
      "series[1].episodes", "series[1].seasons", "series[1].monthsActive", "series[1].rewatched",
      "series[1].biggestNight.date", "series[1].biggestNight.episodes", "series.top3Share", "counts.series",
    ],
    identity: ["series[1].title", "series[2].title"],
    bands: [{ fact: "series.top3Share", at: [0.5] }],
  }),
  "deck.topFilms": slot("deck.topFilms", "top-films", DECK, {
    allowedFacts: [
      ...n5.map((n) => `films[${n}].title` as const),
      ...n5.map((n) => `films[${n}].plays` as const),
      "films.finishedShare", "films.longest.title", "films.longest.minutes", "counts.films",
    ],
    identity: ["films[1].title", "films.longest.title"],
    bands: [{ fact: "films.finishedShare", at: [0.5, 0.85] }],
  }),
  "deck.taste": slot("deck.taste", "taste", DECK, {
    allowedFacts: [
      ...n5.map((n) => `taste.genre[${n}].name` as const),
      "taste.genre[2].share", "taste.genre[3].share", "taste.oldest.title", "taste.oldest.year", "taste.freshShare",
    ],
    identity: ["taste.genre[1].name", "taste.genre[2].name", "taste.oldest.title"],
    bands: [
      { fact: "taste.genre[1].share", at: [0.5] },
      { fact: "taste.freshShare", at: [0.3, 0.5] },
    ],
  }),
  "deck.people": slot("deck.people", "people", DECK, {
    allowedFacts: [...n5.map((n) => `people.actor[${n}].name` as const), ...n3.map((n) => `people.director[${n}].name` as const)],
    identity: ["people.actor[1].name", "people.director[1].name"],
    bands: [],
  }),
  "deck.clock": slot("deck.clock", "clock", DECK, {
    allowedFacts: [
      "hours.afterDarkShare", "hours.goldenShare", "hours.medianStart", "hours.latestStart.time",
      "hours.latestStart.weekday", "hours.quietest", "days.weekendShare",
    ],
    identity: ["hours.peak", "hours.latestStart.weekday"],
    bands: [
      { fact: "hours.afterDarkShare", at: [0.3, 0.5, 0.85] },
      { fact: "hours.goldenShare", at: [0.3, 0.5] },
      { fact: "days.weekendShare", at: [0.5] },
    ],
  }),
  "deck.calendar": slot("deck.calendar", "calendar", DECK, {
    allowedFacts: [
      "streak.longest.from", "streak.longest.to", "days.active", "window.elapsedDays", "days.biggest.date",
      "days.biggest.minutes", "days.longestGap.days", "days.longestGap.month", "days.biggestWeek", "days.biggestWeek.from",
    ],
    identity: ["window.finalCut", "days.biggest.date", "days.longestGap.month", "streak.longest.from"],
    bands: [],
  }),
  "deck.records": slot("deck.records", "records", DECK, {
    allowedFacts: [
      "records.longestBinge.title", "records.longestBinge.date", "records.deepestBinge.title", "records.mostPaused.title",
      "records.completionShare", "records.rewatchShare", "records.rewatchedTitles", "hours.latestStart.time",
      "hours.latestStart.weekday",
    ],
    identity: ["records.longestBinge.title", "records.mostPaused.title"],
    bands: [
      { fact: "records.completionShare", at: [0.5, 0.85] },
      { fact: "records.rewatchShare", at: [0.3] },
    ],
  }),
  "deck.requests": slot("deck.requests", "requests", DECK, {
    allowedFacts: ["requests.approved", "requests.available", "requests.pending", ...n3.map((n) => `requests.genre[${n}]` as const)],
    identity: ["requests.genre[1]"],
    bands: [],
  }),
  "deck.standing": slot("deck.standing", "standing", DECK, {
    allowedFacts: [
      "standing.members", "community.hours", "community.topSeries", "community.busiestNight",
      "community.peakConcurrent", "community.requestsFulfilled", "community.titlesAdded",
    ],
    identity: ["window.finalCut", "community.topSeries"],
    bands: [],
  }),
  "deck.nextYear": slot("deck.nextYear", "next-year", DECK, {
    allowedFacts: [
      ...n3.map((n) => `next.leftForLater[${n}].title` as const),
      ...n3.map((n) => `next.returning[${n}].title` as const),
      ...n3.map((n) => `next.returning[${n}].date` as const),
      ...n3.map((n) => `next.picks[${n}].title` as const),
    ],
    identity: ["next.leftForLater[1].title", "next.returning[1].title", "next.picks[1].title"],
    bands: [],
  }),
  "archetype.tagline": slot("archetype.tagline", "centrefold", 70, {
    allowedFacts: ["archetype.name"],
    identity: ["archetype.id"],
    bands: [],
  }),
  "archetype.dedication": slot("archetype.dedication", "centrefold", 240, {
    allowedFacts: ["archetype.name", "archetype.runnerUp", "archetype.evidence[1]", "archetype.evidence[2]", "archetype.evidence[3]", "series[1].title", "films[1].title"],
    identity: ["archetype.id", "archetype.runnerUp"],
    bands: [],
  }),
  "archetype.posterLineId": slot("archetype.posterLineId", "centrefold", 70, {
    allowedFacts: [],
    identity: ["archetype.id"],
    bands: [],
  }),
  signOff: slot("signOff", "back-cover", 120, {
    allowedFacts: ["member.firstName", "time.totalHours", "series[1].title", "films[1].title", "archetype.name"],
    identity: ["window.finalCut", "member.firstName", "series[1].title", "archetype.id"],
    bands: [],
  }),
}

/** The slots whose pages were selected, in slot order. */
export function slotsForPages(selected: readonly PageType[]): CopySlot[] {
  return SLOT_IDS.map((id) => COPY_SLOTS[id]).filter((s) => selected.includes(s.page))
}

/**
 * The pages a fact appears on, read from every deck's allowed and hero facts;
 * empty for facts that belong to no one page (member, window, archetype).
 */
export function factPages(id: FactId): IssuePageType[] {
  const pages = new Set<IssuePageType>()
  for (const deck of DECK_SLOT_IDS) {
    const { page, allowedFacts } = COPY_SLOTS[deck]
    if (allowedFacts.includes(id) || HERO_FACTS[page]?.includes(id)) pages.add(page)
  }
  return [...pages]
}

/**
 * A hash of what the slot's claim depends on: the identity facts' values and
 * which side of each band the member is on. A number that merely grows keeps
 * it; a new No. 1, the final cut or a crossed band changes it.
 *
 * @example
 * ```ts
 * slotDependencyHash(COPY_SLOTS["deck.clock"], facts) // 64 hex characters
 * ```
 */
export function slotDependencyHash(slot: CopySlot, facts: RewindFactsV3): string {
  const identity = Object.fromEntries(slot.identity.map((id) => [id, facts[id]?.value ?? null]))
  const bands = Object.fromEntries(
    slot.bands.map(({ fact, at }) => {
      const value = facts[fact]?.value
      return [fact, typeof value === "number" ? at.filter((t) => value >= t).length : null]
    })
  )
  return sha256Hex(canonicalJson({ slot: slot.id, identity, bands }))
}
