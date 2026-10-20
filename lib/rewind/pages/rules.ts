/**
 * The pages whose steps have not landed (P5.6, P5.7, P7.1, P7.2): each keeps
 * its page rule from design 4.3 as `select`, with empty data, a summary read
 * off the facts and the facts its card will print. A page step replaces its
 * entry here with its own module, schema, table and summary.
 *
 * | Page | Kept when |
 * |---|---|
 * | 04 Guess | the quiz is on (`quiz.gapMinutes`: 3 candidates, No. 1 more than 2% ahead, D7) |
 * | 05, 06 | there is a series, a film |
 * | 07, 08 | Taste (60% genre coverage), People (70% cast coverage) |
 * | 11 The race | the race is eligible |
 * | 12 Records | 2 of 4 cells: a binge of 3+, a day of 3+ episodes, completion over 5+ started, a paused title |
 * | 13 Setup | 20 plays (Setup is eligible) |
 * | 14 Requests | one request or more |
 * | 15 Standing | 5 members with a Rewind |
 * | 17 Next year | a series left for later or a pick |
 *
 * @module lib/rewind/pages/rules
 */

import { z } from "zod"

import type { IssuePageType, PageDefinition, SelectContext } from "@/lib/rewind/registry"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { has, num, shown } from "./facts"

const EmptySchema = z.strictObject({})
type Empty = z.infer<typeof EmptySchema>
type Pending = Exclude<IssuePageType, "cover" | "number" | "bookends">

const RECORD_CELLS = 2

function pending(
  keep: (facts: RewindFactsV3, ctx: SelectContext) => boolean,
  summary: (facts: RewindFactsV3) => string,
  share: FactId[],
  chart = false
): PageDefinition<Empty> {
  return {
    select: (facts, ctx) => (keep(facts, ctx) ? {} : null),
    schema: EmptySchema,
    srSummary: (_data, facts) => summary(facts),
    ...(chart ? { table: () => null } : {}),
    share: { facts: share },
  }
}

function recordCells(facts: RewindFactsV3): number {
  return [
    has(facts, "records.longestBinge.episodes"),
    num(facts, "records.mostEpisodesDay") >= 3,
    has(facts, "records.completionShare"),
    has(facts, "records.mostPaused.title"),
  ].filter(Boolean).length
}

/** Pages P5.7 built: the clock, the calendar, the centrefold and the back cover. */
type Landed = "clock" | "calendar" | "centrefold" | "back-cover"

export const pendingPages: Record<Exclude<Pending, Landed>, PageDefinition<Empty>> = {
  guess: pending((f) => has(f, "quiz.gapMinutes"), () => "A quiz: which series did you watch most this year?", []),
  "top-shows": pending((f) => has(f, "series[1].title"), (f) => `Your top series was ${shown(f, "series[1].title")}.`, ["series[1].title", "series[1].minutes"], true),
  "top-films": pending((f) => has(f, "films[1].title"), (f) => `Your top film was ${shown(f, "films[1].title")}.`, ["films[1].title", "films[1].plays"], true),
  taste: pending((f) => has(f, "taste.genre[1].name"), (f) => `Your top genre was ${shown(f, "taste.genre[1].name")}.`, ["taste.genre[1].name", "taste.genre[1].share"], true),
  people: pending(
    (f) => has(f, "people.actor[1].name") || has(f, "people.director[1].name"),
    (f) => `The name you saw most was ${shown(f, has(f, "people.actor[1].name") ? "people.actor[1].name" : "people.director[1].name")}.`,
    ["people.actor[1].name", "people.director[1].name"]
  ),
  race: pending((f) => has(f, "race.leadChanges"), (f) => `${shown(f, "race.leader[12]") || shown(f, "race.leader[11]")} finished the race in front.`, ["race.leadChanges"], true),
  records: pending((f) => recordCells(f) >= RECORD_CELLS, () => "Your personal bests of the year.", ["records.longestBinge.episodes", "records.completionShare"]),
  setup: pending((_f, { stats }) => stats.devices.eligible, (f) => `Most of your viewing was on ${shown(f, "setup.topPlatform")}.`, ["setup.directPlayShare"], true),
  requests: pending((f) => has(f, "requests.made"), (f) => `You made ${shown(f, "requests.made")} requests.`, ["requests.made", "requests.available"]),
  standing: pending((f) => has(f, "standing.members"), (f) => `${shown(f, "standing.percentile")} of ${shown(f, "standing.members")} members by hours watched.`, ["standing.percentile"], true),
  "next-year": pending(
    (f) => has(f, "next.leftForLater[1].title") || has(f, "next.picks[1].title"),
    () => "Series and films waiting for next year.",
    ["next.leftForLater[1].title", "next.picks[1].title"]
  ),
}
