/**
 * The frozen fact sheet of one member's Rewind (design 7.8): every fact
 * pages, cards and the LLM read, with its raw value, its unit and its display
 * string.
 *
 * Facts come from the member's stats (`./values.ts`), their name and the
 * window, the archetype `selectArchetype` chose, and the server medians.
 * Ineligible facts are absent rather than null. `display` is the only text
 * form of a number anywhere downstream, so every surface prints the same
 * "1,307".
 *
 * @module lib/wrapped/facts/build-facts
 */

import type { ServerAggregate } from "@/lib/wrapped/aggregate/schema"
import { getArchetype } from "@/lib/wrapped/archetypes/catalogue"
import type { ArchetypeSelection } from "@/lib/wrapped/archetypes/select"
import { memberName } from "@/lib/wrapped/member-name"
import type { MemberStats } from "@/lib/wrapped/stats/compute"
import { dayKey, type TimeWindow } from "@/lib/wrapped/time/zone"

import { FACTS, type FactId, type RewindFactsV3 } from "./catalogue"
import { display, type FactValue } from "./display"
import { statFacts, type FactValues } from "./values"

const MAX_NAME = 24

export interface BuildFactsInput {
  member: {
    /** `User.name`; only its first word is used, and never an email address. */
    name: string | null
    /** Completed Rewinds, this one included (P5.9 reads the database). */
    nthRewind?: number
    serial?: string
  }
  window: TimeWindow & { year: number; finalCut: boolean }
  archetype: ArchetypeSelection | null
  /** `aggregate.medians`; null under 10 scored members. */
  medians?: ServerAggregate["medians"]
  /** `Config.locale`. */
  locale: string
}

/**
 * The first word of the member's name, at most 24 characters, or null.
 *
 * @example
 * ```ts
 * firstName("  Mike Chester ")   // "Mike"
 * firstName("mike@example.com")  // null
 * ```
 */
export function firstName(name: string | null): string | null {
  const word = memberName({ name })?.split(/\s+/)[0]
  return word ? Array.from(word).slice(0, MAX_NAME).join("") : null
}

function memberAndWindow(stats: MemberStats, { member, window }: BuildFactsInput): FactValues {
  const since = stats.bookends.member.since
  const values: Record<string, FactValue | undefined> = {
    "member.firstName": firstName(member.name),
    "member.since": since && Number(since.slice(0, 4)),
    "member.volume": since && window.year - Number(since.slice(0, 4)) + 1,
    "member.lifetimeHours": stats.bookends.member.lifetimeHours,
    "member.nthRewind": member.nthRewind,
    "member.serial": member.serial,
    "window.from": dayKey(window.start, window.zone),
    "window.through": dayKey(window.end - 1, window.zone),
    "window.finalCut": window.finalCut ? 1 : 0,
    "window.elapsedDays": stats.calendar.minutes.length,
    "tz.label": window.zone,
  }
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null && v !== undefined)) as FactValues
}

function medianFacts(medians: ServerAggregate["medians"] | undefined): FactValues {
  if (!medians) return {}
  const values: Record<string, number | null> = {
    "records.longestBinge.median": medians.longestBinge,
    "records.deepestBinge.median": medians.deepestBinge,
    "records.mostEpisodesDay.median": medians.mostEpisodesDay,
    "records.completionShare.median": medians.completionShare,
    "records.mostPaused.median": medians.mostPaused,
    "days.biggestWeek.median": medians.biggestWeek,
  }
  return Object.fromEntries(Object.entries(values).filter(([, v]) => v !== null)) as FactValues
}

function archetypeFacts(pick: ArchetypeSelection | null): FactValues {
  if (!pick) return {}
  const values: FactValues = {
    "archetype.id": pick.id,
    "archetype.name": getArchetype(pick.id).name,
  }
  if (pick.runnerUp) values["archetype.runnerUp"] = getArchetype(pick.runnerUp).name
  if (pick.rarity) {
    values["archetype.rarityCount"] = pick.rarity.count
    values["archetype.rarityShare"] = pick.rarity.count / pick.rarity.of
    values["archetype.scoredMembers"] = pick.rarity.of
  }
  return values
}

/**
 * @example
 * ```ts
 * const facts = buildFacts(stats, { member: { name: "Mike" }, window, archetype, locale: "en-US" })
 * facts["time.totalHours"]  // { value: 1307, display: "1,307", unit: "hours" }
 * facts["hours.peak"]       // { value: 22, display: "10\u00A0PM", unit: "hour" }
 * ```
 */
export function buildFacts(stats: MemberStats, input: BuildFactsInput): RewindFactsV3 {
  const values: FactValues = {
    ...statFacts(stats),
    ...memberAndWindow(stats, input),
    ...medianFacts(input.medians),
    ...archetypeFacts(input.archetype),
  }
  const facts: RewindFactsV3 = {}
  for (const [id, value] of Object.entries(values) as Array<[FactId, FactValue]>) {
    const { unit } = FACTS[id]
    facts[id] = { value, display: display(unit, value, input), unit }
  }
  // Evidence reads as the facts it points at; one the member lacks is dropped.
  const evidence = (input.archetype?.evidence ?? []).filter((id) => facts[id])
  evidence.slice(0, 3).forEach((id, i) => {
    facts[`archetype.evidence[${(i + 1) as 1 | 2 | 3}]`] = { value: id, display: facts[id]!.display, unit: "text" }
  })
  return facts
}
