/**
 * The pages a member's issue omits and the edition they get (design 4.3,
 * 4.5), read from their facts and stats, for the golden facts test.
 *
 * P5.5's registry `select()` takes this over; until then these are the page
 * rules P2.10's README states, so the goldens pin them for P5.5 to match.
 *
 * | Page | Kept when |
 * |---|---|
 * | 03 Bookends | the first and last plays are not the same title on the same day |
 * | 04 Guess | the quiz is on (`quiz.gapMinutes`: 3 candidates, No. 1 more than 2% ahead, D7) |
 * | 05, 06 | there is a series, a film |
 * | 07, 08 | Taste (60% genre coverage), People (70% cast coverage) |
 * | 09 The clock | more than 10 counted plays |
 * | 11 The race | the race is eligible |
 * | 12 Records | 2 of 4 cells: a binge of 3+, a day of 3+ episodes, completion over 5+ started, a paused title |
 * | 13 Setup | 20 plays (Setup is eligible) |
 * | 14 Requests | one request or more |
 * | 15 Standing | 5 members with a Rewind |
 * | 17 Next year | a series left for later or a pick |
 *
 * 01, 02, 10, 16 and 18 are always kept.
 */

import { isPostcard } from "@/lib/wrapped/archetypes/select"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"
import type { MemberStats } from "@/lib/wrapped/stats/compute"

const POCKET_MINUTES = 5 * 60
const POCKET_PLAYS = 10
const FULL_PAGES = 10

export function omittedPages(facts: RewindFactsV3, stats: MemberStats): number[] {
  const has = (id: keyof RewindFactsV3) => facts[id] !== undefined
  const cells = [
    has("records.longestBinge.episodes"),
    Number(facts["records.mostEpisodesDay"]?.value ?? 0) >= 3,
    has("records.completionShare"),
    has("records.mostPaused.title"),
  ].filter(Boolean).length
  const kept: Record<number, boolean> = {
    3: !stats.bookends.sameTitleSameDay,
    4: has("quiz.gapMinutes"),
    5: has("series[1].title"),
    6: has("films[1].title"),
    7: has("taste.genre[1].name"),
    8: has("people.actor[1].name") || has("people.director[1].name"),
    9: stats.plays > 10,
    11: has("race.leadChanges"),
    12: cells >= 2,
    13: stats.devices.eligible,
    14: has("requests.made"),
    15: has("standing.members"),
    17: has("next.leftForLater[1].title") || has("next.picks[1].title"),
  }
  return Object.entries(kept)
    .filter(([, ok]) => !ok)
    .map(([page]) => Number(page))
}

export function editionOf(stats: MemberStats, omitted: readonly number[]): "full" | "pocket" | "postcard" {
  if (isPostcard(stats)) return "postcard"
  const light = stats.totals.totalMinutes < POCKET_MINUTES || stats.plays < POCKET_PLAYS
  return light || 18 - omitted.length < FULL_PAGES ? "pocket" : "full"
}
