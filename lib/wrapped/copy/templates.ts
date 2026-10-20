/**
 * Every deterministic word of a Rewind issue (design 4.2, 8.5): page
 * headlines, the fallback for every copy slot, the window wording, the time
 * zone notes, the cover lines and the pocket-edition note.
 *
 * Templates are token strings like model copy, rendered through
 * `renderCopy`, so a number or title enters them only as a token. Values that
 * are not facts (the issue year, the first title of the year) are template
 * tokens under `copy.`, which {@link copyLocals} builds.
 *
 * ## Variants
 *
 * Each slot has two or three variants. `hash(userId, slotId)` picks one among
 * the variants whose tokens the member has, so a member always reads the same
 * line and the last, token-free variant always renders. A variant may be
 * `{ open, final }`: window wording ("so far", "still") appears only in
 * templates and follows `window.finalCut`, so no sentence goes stale in
 * January.
 *
 * P5.5 to P5.7 add their pages' headlines and decks here.
 *
 * @module lib/wrapped/copy/templates
 */

import { createHash } from "node:crypto"

import type { IssuePageType } from "@/lib/rewind/registry"
import { posterLineIds, type ArchetypeId } from "@/lib/wrapped/archetypes/catalogue"
import type { PageType } from "@/lib/wrapped/data/page-types"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { POSTER_LINES } from "./poster-lines"
import { tokenIds, type TokenSource } from "./render-copy"
import type { SlotId } from "./slots"

type Variant = string | { open: string; final: string }

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
  return parseInt(createHash("sha256").update(`${userId}:${key}`).digest("hex").slice(0, 8), 16) % n
}

const isFinal = (facts: RewindFactsV3) => facts["window.finalCut"]?.value === 1
const resolve = (v: Variant, facts: RewindFactsV3) => (typeof v === "string" ? v : isFinal(facts) ? v.final : v.open)
const t = (id: string) => `{{fact:${id}}}`

const SLOT_TEMPLATES: Readonly<Record<Exclude<SlotId, "archetype.posterLineId" | "archetype.tagline">, readonly Variant[]>> = {
  "deck.number": [
    { open: `That's ${t("time.daysHours")} of screen time, about ${t("time.perDay")} for every day of the year so far.`, final: `That's ${t("time.daysHours")} of screen time, about ${t("time.perDay")} for every day of the year.` },
    { open: `Put end to end, that's ${t("time.daysHours")}, or about ${t("time.perDay")} a day so far.`, final: `Put end to end, that's ${t("time.daysHours")}, or about ${t("time.perDay")} a day.` },
    "Every minute of it counted from your own history.",
  ],
  "deck.bookends": [
    `You have pressed play here since ${t("member.since")}, ${t("member.lifetimeHours")} hours in all.`,
    `Here since ${t("member.since")}, and this is how the year opened and closed.`,
    "How the year opened, and where it stands now.",
  ],
  "deck.topShows": [
    `${t("series[1].title")} came first, and ${t("series[2].title")} came next.`,
    `${t("series[1].episodes")} episodes of ${t("series[1].title")}, across ${t("series[1].monthsActive")} months.`,
    "The series you kept returning to, in order.",
  ],
  "deck.topFilms": [
    `You finished ${t("films.finishedShare")} of the films you started.`,
    `The longest was ${t("films.longest.title")}, at ${t("films.longest.minutes")}.`,
    "Your films of the year, ranked by plays.",
  ],
  "deck.taste": [
    `After ${t("taste.genre[1].name")} came ${t("taste.genre[2].name")} and ${t("taste.genre[3].name")}.`,
    `The oldest thing you watched was ${t("taste.oldest.title")}, from ${t("taste.oldest.year")}.`,
    "Genres as the server tags them, counted by minutes.",
  ],
  "deck.people": [
    `${t("people.actor[1].name")} led the cast list, with ${t("people.actor[2].name")} next.`,
    `Behind the camera, ${t("people.director[1].name")} came up first.`,
    "The names that kept coming back on screen.",
  ],
  "deck.clock": [
    `${t("hours.afterDarkShare")} of your viewing started after dark.`,
    `Your latest start was ${t("hours.latestStart.time")} on a ${t("hours.latestStart.weekday")}.`,
    "When you pressed play, hour by hour.",
  ],
  "deck.calendar": [
    { open: `You pressed play on ${t("days.active")} of ${t("window.elapsedDays")} so far.`, final: `You pressed play on ${t("days.active")} of ${t("window.elapsedDays")}.` },
    `Your biggest day was ${t("days.biggest.date")}, at ${t("days.biggest.minutes")}.`,
    "Every square is a day; the darker, the longer.",
  ],
  "deck.records": [
    `You finished ${t("records.completionShare")} of what you started.`,
    `The longest run was ${t("records.longestBinge.title")}, on ${t("records.longestBinge.date")}.`,
    "Personal bests, set against nobody but yourself.",
  ],
  "deck.requests": [
    `${t("requests.available")} of them have arrived on the server.`,
    `Your requests leaned toward ${t("requests.genre[1]")}.`,
    "Every request, and what became of it.",
  ],
  "deck.standing": [
    { open: `Across the server, members pressed play for ${t("community.hours")} hours so far.`, final: `Across the server, members pressed play for ${t("community.hours")} hours this year.` },
    `The server's favourite series was ${t("community.topSeries")}.`,
    "Where you stand, with nobody named.",
  ],
  "deck.nextYear": [
    `${t("next.leftForLater[1].title")} is waiting where you left it.`,
    `A pick for the new year: ${t("next.picks[1].title")}.`,
    "Things to pick up when the new year starts.",
  ],
  "archetype.dedication": [
    `Picked from your own history, not from a quiz. ${t("archetype.runnerUp")} came second.`,
    "Every reason here comes from what you watched, not from a guess.",
  ],
  signOff: [
    { open: `See you in the final cut, ${t("member.firstName")}.`, final: `See you next year, ${t("member.firstName")}.` },
    { open: "The year is not over yet. The final cut lands in the new year.", final: "That was the year. Thanks for pressing play." },
  ],
}

function choose(variants: readonly string[], key: string, ctx: TemplateContext): string {
  const usable = variants.filter((v) => tokenIds(v).every((id) => ctx.facts[id as keyof RewindFactsV3] ?? ctx.locals?.[id]))
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
 * // "That's {{fact:time.daysHours}} of screen time, about {{fact:time.perDay}} for every day of the year so far."
 * ```
 */
export function slotTemplate(slot: Exclude<SlotId, "archetype.posterLineId">, ctx: TemplateContext): string {
  if (slot === "archetype.tagline") {
    const id = ctx.facts["archetype.id"]?.value as ArchetypeId | undefined
    const lines = id ? posterLineIds(id).map((line) => POSTER_LINES[line]) : ["Your year, in a word."]
    return choose(lines, slot, ctx)
  }
  return choose(SLOT_TEMPLATES[slot].map((v) => resolve(v, ctx.facts)), slot, ctx)
}

/** "Data through November 30" during the season, "Final cut" after it. */
export function windowLine(facts: RewindFactsV3): string {
  return isFinal(facts) ? "Final cut" : `Data through ${t("window.through")}`
}

/** The zone note under every clock time (design 7.7). */
export function tzNote(zone: "member" | "server"): string {
  return `Times in ${t("tz.label")}, ${zone === "member" ? "your" : "the server's"} time zone`
}

/** The short zone note where space is tight: the centrefold key row and cards. */
export function tzShort(): string {
  return `Times in ${t("tz.label")}`
}

/** The pocket edition's note, which says "template" only when every word is one (design 4.5). */
export function pocketNote(copySource: "llm" | "repair" | "template" | "mixed"): string {
  return copySource === "template"
    ? "Six pages for a quieter year, and every word on them comes from a template."
    : "The six pages that sum up your year."
}

const HEADLINES: Readonly<Record<IssuePageType, (facts: RewindFactsV3) => string>> = {
  cover: (f) => (f["member.firstName"] ? `${t("member.firstName")}'s year in film and television` : "Your year in film and television"),
  number: () => "This year you pressed play for",
  bookends: () => `You opened ${t("copy.year")} with ${t("copy.firstTitle")}`,
  guess: () => "Which series did you watch most this year?",
  "top-shows": () => "The shows you kept coming back to",
  "top-films": () => "Your double features",
  taste: (f) =>
    Number(f["taste.genre[1].share"]?.value) >= 0.5
      ? `Mostly ${t("taste.genre[1].name")}, made around ${t("taste.medianYear")}`
      : `Led by ${t("taste.genre[1].name")}, made around ${t("taste.medianYear")}`,
  people: () => "Starring",
  clock: () => `Your hour is ${t("hours.peak")}`,
  calendar: (f) => (Number(f["streak.longest.days"]?.value) >= 2 ? `${t("streak.longest.days")} without a night off` : "Your year, day by day"),
  race: (f) => (f["race.leadChanges"]?.value === 0 ? `${t("race.leader[1]")} led all year. Nothing came close.` : "The race for your attention"),
  records: () => "Personal bests",
  setup: (f) => (Number(f["setup.directPlayShare"]?.value) >= 0.8 ? `${t("setup.directPlayShare")} direct play. Your setup is dialled in.` : "How you watched"),
  requests: (f) => (f["requests.watched"] ? `You asked for ${t("requests.made")}. You watched ${t("requests.watched")} of them.` : `You asked for ${t("requests.made")}.`),
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
