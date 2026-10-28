/**
 * Every deterministic word of a Rewind issue (design 4.2, 8.5): page
 * headlines, the fallback for every copy slot, the window wording, the
 * cover lines and the pocket-edition note.
 *
 * Templates are token strings like model copy, rendered through
 * `renderCopy`, so a number or title enters them only as a token. Values that
 * are not facts (the issue year, the first title of the year) are template
 * tokens under `copy.`, which {@link copyLocals} builds.
 *
 * ## Variants
 *
 * Each slot has two or three variants. `hash(userId, slotId)` picks one among
 * the variants whose tokens the member has, none of them a count or share of
 * zero, so a member always reads the same line and the last, token-free
 * variant always renders. An issue is finished
 * the day it is generated, so no template says "so far" or promises more of
 * the year: each line reads true for 1 January to 30 November and for the
 * whole year alike.
 *
 * P5.5 to P5.7 add their pages' headlines and decks here; P5.7 adds the
 * "Why this?" reasons (`whyReasons`).
 *
 * @module lib/wrapped/copy/templates
 */

import { sha256Hex } from "@/lib/utils/sha256"

import type { IssuePageType } from "@/lib/rewind/registry"
import { getArchetype, posterLineIds, type ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { FactUnit } from "@/lib/wrapped/facts/display"

import { POSTER_LINES } from "./poster-lines"
import { tokenIds, type TokenSource } from "./render-copy"
import type { SlotId } from "./slots"

export interface TemplateContext {
  facts: RewindFactsV3
  userId: string
  locals?: TokenSource
}

/** Template-only tokens: the issue year, on Bookends the first title of the year, and on Top shows the quiz guess. */
export function copyLocals({ year, firstTitle, guess }: { year: number; firstTitle?: string; guess?: string }): TokenSource {
  return {
    "copy.year": { display: String(year), unit: "year" },
    ...(firstTitle ? { "copy.firstTitle": { display: firstTitle, unit: "title" as const } } : {}),
    ...(guess ? { "copy.guess": { display: guess, unit: "title" as const } } : {}),
  }
}

/** A stable pick for this member and key. */
function pickIndex(userId: string, key: string, n: number): number {
  return parseInt(sha256Hex(`${userId}:${key}`).slice(0, 8), 16) % n
}

const t = (id: string) => `{{fact:${id}}}`

/** Every slot's fallback variants; P8.1's freeze lock hashes them. */
export const SLOT_TEMPLATES: Readonly<Record<Exclude<SlotId, "archetype.posterLineId" | "archetype.tagline">, readonly string[]>> = {
  "deck.number": [`That's ${t("time.daysHours")}, about ${t("time.perDay")} a day.`, `End to end, that's ${t("time.daysHours")}.`, "Every play of the year, added up."],
  // The lifetime line under the deck already names the member's history.
  "deck.bookends": ["Opening night to last call.", "First in, last out."],
  "deck.topShows": [
    `${t("series[1].title")} came first, and ${t("series[2].title")} came next.`,
    `Your biggest night with ${t("series[1].title")} was ${t("series[1].biggestNight.date")}.`,
    "Your shows, ranked by time watched.",
  ],
  "deck.topFilms": [
    `You finished ${t("films.finishedShare")} of the movies you started.`,
    `The longest was ${t("films.longest.title")}, at ${t("films.longest.minutes")}.`,
    "Your movies, ranked by plays.",
  ],
  "deck.taste": [`The oldest thing you watched was ${t("taste.oldest.title")}, from ${t("taste.oldest.year")}.`, "Your taste, by genre and year."],
  "deck.people": [
    `${t("people.actor[1].name")} led the cast list, with ${t("people.actor[2].name")} next.`,
    `Behind the camera, ${t("people.director[1].name")} came up first.`,
    "The names that came up in your viewing.",
  ],
  "deck.clock": [
    `${t("hours.afterDarkShare")} of your viewing started after dark.`,
    `Your latest start was ${t("hours.latestStart.time")} on a ${t("hours.latestStart.weekday")}.`,
    "When in the day you pressed play.",
  ],
  "deck.calendar": [
    `You pressed play on ${t("days.active")} of ${t("window.elapsedDays")}.`,
    `Your biggest day was ${t("days.biggest.date")}, at ${t("days.biggest.minutes")}.`,
    "Big days and quiet ones.",
  ],
  "deck.records": [`The longest run was ${t("records.longestBinge.title")}, on ${t("records.longestBinge.date")}.`, "The biggest marks you set this year."],
  "deck.requests": [`Your requests leaned toward ${t("requests.genre[1]")}.`, "What you asked the server for."],
  "deck.standing": [
    `Across the server, members pressed play for ${t("community.hours")} hours this year.`,
    `The server's favourite show was ${t("community.topSeries")}.`,
    "How your year compares on the server.",
  ],
  "deck.nextYear": [
    `${t("next.leftForLater[1].title")} is waiting where you left it.`,
    `A pick for the new year: ${t("next.picks[1].title")}.`,
    "Something to look forward to.",
  ],
  "archetype.dedication": [`For ${t("series[1].title")}, which kept you company.`, `For ${t("films[1].title")}, your movie of the year.`, "Earned from your own viewing."],
  signOff: [`See you next year, ${t("member.firstName")}.`, "That was the year. Thanks for pressing play."],
}

/** The units that count something, where 0 means none; a weekday, time or hour of 0 is Sunday or midnight. */
const QUANTITY_UNITS: ReadonlySet<FactUnit> = new Set(["hours", "duration", "days-hours", "count", "decimal", "days", "times", "share"])

/** Whether a variant may cite this token: the member has it, and it counts more than none ("0% of your viewing started after dark"). */
function citable(id: string, ctx: TemplateContext): boolean {
  const fact = ctx.facts[id as keyof RewindFactsV3]
  return fact ? !(fact.value === 0 && QUANTITY_UNITS.has(fact.unit)) : Boolean(ctx.locals?.[id])
}

function choose(variants: readonly string[], key: string, ctx: TemplateContext): string {
  const usable = variants.filter((v) => tokenIds(v).every((id) => citable(id, ctx)))
  const from = usable.length > 0 ? usable : variants.slice(-1)
  return from[pickIndex(ctx.userId, key, from.length)]
}

/** The poster line a template-only issue prints: one of the archetype's five. */
export function posterLineTemplate(archetype: ArchetypeId, userId: string): string {
  const ids = posterLineIds(archetype)
  return ids[pickIndex(userId, "archetype.posterLineId", ids.length)]
}

/**
 * A slot's template copy for this member. The tagline is one of the
 * archetype's poster lines.
 *
 * @example
 * ```ts
 * slotTemplate("deck.number", { facts, userId })
 * // "That's {{fact:time.daysHours}}, about {{fact:time.perDay}} a day."
 * ```
 */
export function slotTemplate(slot: Exclude<SlotId, "archetype.posterLineId">, ctx: TemplateContext): string {
  if (slot === "archetype.tagline") {
    const id = ctx.facts["archetype.id"]?.value as ArchetypeId | undefined
    const lines = id ? posterLineIds(id).map((line) => POSTER_LINES[line]) : ["Your year, in a word."]
    return choose(lines, slot, ctx)
  }
  return choose(SLOT_TEMPLATES[slot], slot, ctx)
}

/** "Data through November 30", or "Data through December 31" for an issue made after the year ended. */
export function windowLine(): string {
  return `Data through ${t("window.through")}`
}

/** The pocket edition's note (design 4.5). */
export const POCKET_NOTE = "The six pages that sum up your year."

/** The pocket Short list's headline, by how many titles it lists (P7.3, `pocket-short-list.png`). */
export function shortListHeadline(rows: number): string {
  return rows >= 3 ? "Three things you made time for" : rows === 2 ? "Two things you made time for" : "The one thing you made time for"
}

/** The Short list's deck: template-only, for a pocket member and for a full issue's pocket cut alike. The total is The number's. */
export function shortListDeck(edition: "full" | "pocket" | "postcard"): string {
  return edition === "full" ? "The titles at the top of your year." : "A small year, well chosen."
}

/** The postcard's headline (design 4.5); the server name is plain text, never a token. */
export function postcardHeadline(serverName: string): string {
  return `A quiet year on ${serverName}`
}

/** One plain-language reason per evidence fact a scorer cites (`lib/wrapped/archetypes/scorers.ts`). */
const REASONS: Partial<Record<FactId, string>> = {
  "hours.afterDarkShare": `${t("hours.afterDarkShare")} of your plays started between 10 PM and 4 AM.`,
  "hours.goldenShare": `${t("hours.goldenShare")} of your plays started between 6 PM and 10 PM.`,
  "hours.peak": `Your busiest hour was ${t("hours.peak")}.`,
  "hours.quietest": `Your quietest hour was ${t("hours.quietest")}.`,
  "records.completionShare": `You finished ${t("records.completionShare")} of what you started.`,
  "films.finishedShare": `You finished ${t("films.finishedShare")} of the movies you started.`,
  "records.rewatchShare": `${t("records.rewatchShare")} of your plays went to titles you kept coming back to.`,
  "records.rewatchedTitles": `Titles you came back to: ${t("records.rewatchedTitles")}.`,
  "taste.freshShare": `${t("taste.freshShare")} of your plays came within two weeks of a release.`,
  "time.seriesShare": `Shows took ${t("time.seriesShare")} of your time.`,
  "time.filmsShare": `Movies took ${t("time.filmsShare")} of your time.`,
  "records.deepestBinge.episodes": `Episodes in your deepest binge: ${t("records.deepestBinge.episodes")}.`,
  "days.weekendShare": `${t("days.weekendShare")} of your plays started at the weekend.`,
  "time.totalHours": `Hours you watched in all: ${t("time.totalHours")}.`,
  "time.totalMinutes": `Time you watched in all: ${t("time.totalMinutes")}.`,
  "counts.titles": `Different titles you watched: ${t("counts.titles")}.`,
  "counts.titlesPer10Hours": `New titles for every ten hours: ${t("counts.titlesPer10Hours")}.`,
  "counts.films": `Movies you watched: ${t("counts.films")}.`,
  "series.top3Share": `Your top three shows took ${t("series.top3Share")} of your show time.`,
  "series[1].title": `${t("series[1].title")} came first, by a distance.`,
  "days.active": `Days you pressed play: ${t("days.active")}.`,
}

/**
 * The "Why this?" sheet's reasons (design 4.3 page 16): for each shortlisted
 * archetype, one plain sentence per evidence fact the member has, each citing
 * only that fact.
 *
 * @example
 * ```ts
 * whyReasons([{ id: "midnight-marathoner", evidence: ["hours.peak"] }])
 * // [{ id: "midnight-marathoner", name: "The Midnight Marathoner", reasons: ["Your busiest hour was {{fact:hours.peak}}."] }]
 * ```
 */
export function whyReasons(shortlist: ReadonlyArray<{ id: ArchetypeId; evidence: readonly FactId[] }>) {
  return shortlist.map(({ id, evidence }) => ({
    id,
    name: getArchetype(id).name,
    reasons: evidence.flatMap((fact) => (REASONS[fact] ? [REASONS[fact]] : [])),
  }))
}

const MONTH_WORDS = ["", "one month", "two months", "three months", "four months", "five months", "six months", "seven months", "eight months", "nine months", "ten months", "eleven months"]

/**
 * 11 The race's headline from its events (design 4.3): "Severance led for
 * ten months. Then came November." when the lead changed, naming the leader
 * the final overtake displaced and how long its run lasted, or "Severance
 * led all year." when it never did.
 */
function raceHeadline(f: RewindFactsV3): string {
  const leaderOf = (month: number) => `race.leader[${month}]` as FactId
  const months = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].filter((m) => f[leaderOf(m)])
  if (months.length === 0) return "The race for your attention"
  if (f["race.leadChanges"]?.value === 0) return `${t(leaderOf(months[0]))} led all year.`
  const overtake = Number(f["race.overtakeMonth"]?.value)
  const before = months.filter((m) => m < overtake)
  const displaced = before.at(-1)
  if (displaced === undefined) return "The race for your attention"
  const title = f[leaderOf(displaced)]?.display
  let run = 0
  for (const m of [...before].reverse()) {
    if (f[leaderOf(m)]?.display !== title) break
    run += 1
  }
  return `${t(leaderOf(displaced))} led for ${MONTH_WORDS[run]}. Then came ${t("race.overtakeMonth")}.`
}

const HEADLINES: Readonly<Record<IssuePageType, (facts: RewindFactsV3) => string>> = {
  cover: (f) => (f["member.firstName"] ? `${t("member.firstName")}'s year in movies and shows` : "Your year in movies and shows"),
  number: () => "This year you pressed play for",
  bookends: () => `You opened ${t("copy.year")} with ${t("copy.firstTitle")}`,
  guess: () => "Which show did you watch most this year?",
  "top-shows": () => "The shows you kept coming back to",
  "top-films": () => "Your double features",
  taste: (f) => {
    const lead = Number(f["taste.genre[1].share"]?.value) >= 0.5 ? `Mostly ${t("taste.genre[1].name")}` : `Led by ${t("taste.genre[1].name")}`
    return f["taste.medianYear"] ? `${lead}, made around ${t("taste.medianYear")}` : lead
  },
  people: () => "Starring",
  clock: () => `Your hour is ${t("hours.peak")}`,
  calendar: (f) => (Number(f["streak.longest.days"]?.value) >= 2 ? `${t("streak.longest.days")} without a night off` : "Your year, day by day"),
  race: raceHeadline,
  records: () => "Personal bests",
  setup: (f) => (Number(f["setup.directPlayShare"]?.value) >= 0.8 ? `${t("setup.directPlayShare")} direct play` : "How you watched"),
  requests: (f) => (Number(f["requests.watched"]?.value) > 0 ? `You asked for ${t("requests.made")}. You watched ${t("requests.watched")} of them.` : `You asked for ${t("requests.made")}.`),
  standing: (f) =>
    Number(f["standing.percentile"]?.value) <= 50
      ? `${t("standing.percentile")} by hours watched`
      : `You were one of ${t("standing.members")} members who pressed play this year`,
  centrefold: () => "You are the",
  "next-year": () => "Unfinished business",
  "back-cover": (f) => (f["member.firstName"] ? `That was your ${t("copy.year")}, ${t("member.firstName")}.` : `That was your ${t("copy.year")}.`),
}

/** A page's headline (or its lead line, on The number and the centrefold). */
export function headline(page: IssuePageType, facts: RewindFactsV3): string {
  return HEADLINES[page](facts)
}

/** 04 Guess asks about series, or about titles of either kind with fewer than 3 series. */
export function quizHeadline(kind: "series" | "mixed"): string {
  return kind === "series" ? HEADLINES.guess({}) : "Which title did you watch most this year?"
}

const RANK_WORDS = ["", "one", "two", "three", "four"] as const

/** The reveal under the tiles, by the chosen title's rank among the options (design 4.3). */
export function quizReveal(rank: number): string {
  if (rank === 1) return "You called it."
  if (rank === 2) return "Close. It came second."
  return `Not quite: that was your number ${RANK_WORDS[rank]}.`
}

/**
 * Top shows' deck after the quiz was answered: it names the guess
 * (`copy.guess`) and, for a near miss, the gap (design 4.3).
 *
 * @example
 * ```ts
 * quizCallback(2) // "You guessed {{fact:copy.guess}}. Close: it came second, {{fact:quiz.gapMinutes}} behind."
 * ```
 */
export function quizCallback(rank: number): string {
  if (rank === 1) return `You guessed ${t("copy.guess")}, and you called it.`
  if (rank === 2) return `You guessed ${t("copy.guess")}. Close: it came second, ${t("quiz.gapMinutes")} behind.`
  return `You guessed ${t("copy.guess")}. It came in at number ${RANK_WORDS[rank]}.`
}

/** Each page's cover line, and the order the cover prefers them in. */
const COVER_LINES: ReadonlyArray<[PageType, string]> = [
  ["number", "One very large number"],
  ["guess", "Guess your top show. No peeking."],
  ["race", "The race for your attention"],
  ["centrefold", "Who you turned out to be"],
  ["top-shows", "The shows you kept coming back to"],
  ["clock", "The hour that was yours"],
  ["calendar", "A year of days, in one grid"],
  ["taste", "What your taste looks like"],
  ["records", "Personal bests, ranked"],
  ["standing", "Where you stand on the server"],
  ["top-films", "Your double features"],
  ["people", "The faces you kept seeing"],
  ["requests", "What you asked for"],
  ["next-year", "Unfinished business"],
  ["bookends", "How the year opened"],
  ["setup", "How you watched"],
  ["short-list", "Your short list"],
]

/**
 * Four cover lines from the selected pages, in folio order, each with the
 * folio of the page it points to, so the numbers are always right (FR-2).
 *
 * @example
 * ```ts
 * coverLines([{ type: "number", folio: 2 }, { type: "centrefold", folio: 9 }])
 * // [{ folio: 2, text: "One very large number" }, { folio: 9, text: "Who you turned out to be" }]
 * ```
 */
export function coverLines(selected: ReadonlyArray<{ type: PageType; folio: number }>): Array<{ folio: number; text: string }> {
  const folios = new Map(selected.map((p) => [p.type, p.folio]))
  return COVER_LINES.filter(([type]) => folios.has(type))
    .slice(0, 4)
    .map(([type, text]) => ({ folio: folios.get(type)!, text }))
    .sort((a, b) => a.folio - b.folio)
}

/**
 * A page's headline that names no title or person: its cover line, else a
 * plain line. A share card prints it when the page's own headline needs a
 * fact the card may not show, such as a title the member hid (P5.10).
 *
 * @example
 * ```ts
 * titleFreeHeadline("bookends") // "How the year opened"
 * ```
 */
export function titleFreeHeadline(page: IssuePageType): string {
  const line = COVER_LINES.find(([type]) => type === page)?.[1]
  return line ?? (page === "cover" ? "A year in movies and shows" : "That was the year")
}
