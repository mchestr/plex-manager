/**
 * The pages whose steps have not landed (P5.7, P7.1, P7.2): each keeps
 * its page rule from design 4.3 as `select`, with empty data, a summary read
 * off the facts and the facts its card will print. A page step replaces its
 * entry here with its own module, schema, table and summary.
 *
 * | Page | Kept when |
 * |---|---|
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

import { has, shown } from "./facts"

const EmptySchema = z.strictObject({})
type Empty = z.infer<typeof EmptySchema>
type Pending = Exclude<IssuePageType, "cover" | "number" | "bookends" | "guess" | "top-shows" | "top-films">

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

/** Pages P5.7 built: the clock, the calendar, the centrefold and the back cover. */
type Landed = "clock" | "calendar" | "centrefold" | "back-cover"
/** Pages P7.1 built: Taste, People, The race and Records. */
type P71 = "taste" | "people" | "race" | "records"

export const pendingPages: Record<Exclude<Pending, Landed | P71>, PageDefinition<Empty>> = {
  setup: pending((_f, { stats }) => stats.devices.eligible, (f) => `Most of your viewing was on ${shown(f, "setup.topPlatform")}.`, ["setup.directPlayShare"], true),
  requests: pending((f) => has(f, "requests.made"), (f) => `You made ${shown(f, "requests.made")} requests.`, ["requests.made", "requests.available"]),
  standing: pending((f) => has(f, "standing.members"), (f) => `${shown(f, "standing.percentile")} of ${shown(f, "standing.members")} members by hours watched.`, ["standing.percentile", "standing.members"], true),
  "next-year": pending(
    (f) => has(f, "next.leftForLater[1].title") || has(f, "next.picks[1].title"),
    () => "Series and films waiting for next year.",
    ["next.leftForLater[1].title", "next.picks[1].title"]
  ),
}
