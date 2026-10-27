/**
 * 09 The clock's Notes (P8.4): the 24 hours and the 7 weekdays as tables,
 * and the after-dark rule.
 *
 * @module lib/rewind/notes/clock
 */

import type { ArticleBlock } from "@/lib/rewind/article/blocks"
import { formatHero, formatHour, formatShare } from "@/lib/rewind/format"
import type { ClockData } from "@/lib/rewind/pages/clock.schema"
import { has, shown } from "@/lib/rewind/pages/facts"

import { headingBlock, paragraphBlock, type CoreNotes } from "./context"

/** Monday first, as the page's weekday row runs. */
const weekdayName = (i: number, locale: string) => new Intl.DateTimeFormat(locale, { weekday: "long", timeZone: "UTC" }).format(Date.UTC(2024, 0, 1 + i))

export const clockNotes: CoreNotes<ClockData> = (data, facts, ctx) => {
  const blocks: ArticleBlock[] = [
    headingBlock("When you pressed play"),
    {
      kind: "table",
      table: { caption: "Plays by the hour they started.", columns: ["Hour", "Plays"], rows: data.hours.map((plays, hour) => [formatHour(hour, ctx), formatHero(plays, ctx)]) },
    },
    {
      kind: "table",
      table: { caption: "Share of plays by the weekday they started.", columns: ["Day", "Share"], rows: data.weekdays.map((share, i) => [weekdayName(i, ctx.locale), formatShare(share, ctx)]) },
    },
  ]
  const rule = `After dark means a play started 10 PM to 4 AM.`
  blocks.push(paragraphBlock(has(facts, "hours.afterDarkShare") ? `${rule} ${shown(facts, "hours.afterDarkShare")} of yours did.` : rule))
  return blocks
}
