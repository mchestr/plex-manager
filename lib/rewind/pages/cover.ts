/**
 * 01 Cover (design 4.3): always present. Its data is the soundtrack's daily
 * minutes; the masthead, data window and cover lines read facts and the
 * selected page list at render.
 *
 * @module lib/rewind/pages/cover
 */

import type { PageDefinition } from "@/lib/rewind/registry"

import { CoverDataSchema, type CoverData } from "./cover.schema"
import { has, issueYear, shown } from "./facts"

export const coverPage: PageDefinition<CoverData> = {
  select: (_facts, { stats }) => ({ minutes: stats.calendar.minutes.map((day) => day.minutes) }),
  schema: CoverDataSchema,
  srSummary: (data, facts) => {
    const days = has(facts, "days.active") ? shown(facts, "days.active") : "0"
    return `The soundtrack of ${issueYear(facts)}: one line for each day, ${days} of ${data.minutes.length} days with something played.`
  },
  share: { facts: ["member.volume", "member.serial", "window.through", "window.finalCut"] },
}
