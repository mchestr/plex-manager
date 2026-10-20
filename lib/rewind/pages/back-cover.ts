/**
 * 18 Back cover (design 4.3): the whole year on one page, then sharing and a
 * clean exit. Always kept. Its data is the soundtrack's daily minutes; the
 * billing block (`lib/rewind/billing-block.ts`) reads facts and the selected
 * list at render.
 *
 * @module lib/rewind/pages/back-cover
 */

import type { PageDefinition } from "@/lib/rewind/registry"

import { BackCoverDataSchema, type BackCoverData } from "./back-cover.schema"
import { has, issueYear, shown } from "./facts"

export const backCoverPage: PageDefinition<BackCoverData> = {
  select: (_facts, { stats }) => ({ minutes: stats.calendar.minutes.map((day) => day.minutes) }),
  schema: BackCoverDataSchema,
  srSummary: (data, facts) => {
    const days = has(facts, "days.active") ? shown(facts, "days.active") : "0"
    return `The soundtrack of ${issueYear(facts)} again: one line for each day, ${days} of ${data.minutes.length} days with something played.`
  },
  share: {
    facts: [
      "time.totalHours",
      "counts.episodes",
      "counts.films",
      "series[1].title",
      "series[2].title",
      "series[3].title",
      "films[1].title",
      "hours.peak",
      "streak.longest.days",
      "standing.percentile",
      "archetype.name",
    ],
    titles: ["series[1].title", "series[2].title", "series[3].title", "films[1].title"],
  },
}
