/**
 * 15 Standing (design 4.3): the member against the server, naming nobody.
 *
 * - The percentile comes from the server-wide pass (`stats/community.ts`).
 *   The headline names it only in the top 50% ("Top 3% by hours watched");
 *   otherwise it reads "You were one of 34 members who pressed play this
 *   year".
 * - A strip of one mark per member, the member's solid, and a community box
 *   of the facts with 3 or more contributors plus `community.titlesAdded`.
 * - The member count and the strip stay in-app: `share.facts` holds only the
 *   percentile, which the share projection prints at top 25% or better
 *   (FR-37).
 * - Kept with 5 or more members who pressed play.
 *
 * @module lib/rewind/pages/standing
 */

import { figure, heading, paragraph, tableBlock } from "@/lib/rewind/article/blocks"
import type { PageDefinition, PageTable } from "@/lib/rewind/registry"
import { headline } from "@/lib/wrapped/copy/templates"
import type { RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { pageDeck } from "./deck"
import { has, num, shown } from "./facts"
import { COMMUNITY_LINES, StandingDataSchema, type StandingData } from "./standing.schema"

type CommunityFact = (typeof COMMUNITY_LINES)[number]

/** The headline names a percentile at this or better. */
const NAMED_PERCENTILE = 50

/** Each community line's label in the box and the Table. */
export const COMMUNITY_LABELS: Record<CommunityFact, string> = {
  "community.hours": "Hours watched here",
  "community.topSeries": "The server's favourite series",
  "community.busiestNight": "The busiest night",
  "community.peakConcurrent": "Most streams at once",
  "community.requestsFulfilled": "Requests fulfilled",
  "community.titlesAdded": "Titles added",
}

/** Whether the headline names the member's percentile. */
export const namesPercentile = (facts: RewindFactsV3): boolean => has(facts, "standing.percentile") && num(facts, "standing.percentile") <= NAMED_PERCENTILE

function standingSummary(data: StandingData, facts: RewindFactsV3): string {
  const members = shown(facts, "standing.members")
  const lead = namesPercentile(facts)
    ? `${shown(facts, "standing.percentile")} by hours watched, among ${members} members who pressed play.`
    : `You were one of ${members} members who pressed play this year.`
  const strip = `One mark per member, most hours first; yours is number ${data.rank}.`
  const box = data.community.map((id) => `${COMMUNITY_LABELS[id]}: ${shown(facts, id)}.`)
  return [lead, strip, ...box].join(" ")
}

function standingTable(data: StandingData, facts: RewindFactsV3): PageTable {
  return {
    caption: `Where you stand by hours watched, and the server's year, from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}. Nobody is named.`,
    columns: ["Measure", "Value"],
    rows: [
      ["Your standing", shown(facts, "standing.percentile")],
      ["Members who pressed play", shown(facts, "standing.members")],
      ...data.community.map((id) => [COMMUNITY_LABELS[id], shown(facts, id)]),
    ],
  }
}

export const standingPage: PageDefinition<StandingData> = {
  select: (facts, { stats }) => {
    const { community } = stats
    if (!community.eligible || !community.standing || !has(facts, "standing.members")) return null
    const lines = COMMUNITY_LINES.filter((id) => has(facts, id) && (id === "community.topSeries" || id === "community.busiestNight" || num(facts, id) > 0))
    return { rank: community.standing.rank, community: lines }
  },
  schema: StandingDataSchema,
  srSummary: standingSummary,
  table: (data, facts) => standingTable(data, facts),
  article: (data, facts, ctx) => [
    heading(headline("standing", facts), facts),
    paragraph(pageDeck(ctx, facts, "standing"), facts),
    ...figure(standingSummary(data, facts)),
    ...tableBlock(standingTable(data, facts)),
  ],
  share: { facts: ["standing.percentile"] },
}
