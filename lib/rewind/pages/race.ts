/**
 * 11 The race (design 4.3): the member's top series month by month. It plays
 * once, 520 ms a month, then holds the final standings and the who-led
 * strip; a revisit or reduced motion shows that final frame at once.
 *
 * Omitted without 3 series of 60 minutes or more across 3 active months
 * (P2.7's `race.eligible`). The stored frames are what P8.3's scrubber
 * reads. Its Table lists each runner's cumulative minutes by month.
 *
 * @module lib/rewind/pages/race
 */

import { figure, heading, tableBlock } from "@/lib/rewind/article/blocks"
import { formatRewindDuration } from "@/lib/rewind/format"
import type { PageDefinition, PageTable } from "@/lib/rewind/registry"
import { raceGeometry } from "@/lib/rewind/viz/race"
import { headline } from "@/lib/wrapped/copy/templates"
import type { FactId, RewindFactsV3 } from "@/lib/wrapped/facts/catalogue"

import { shown } from "./facts"
import { RaceDataSchema, type RaceData } from "./race.schema"
import { ratingKeyOf } from "./title-key.schema"
import { monthName } from "./top-shows"

const PLACES = ["first", "second", "third", "fourth", "fifth"]
/** Copy is English; month names in summaries follow it. */
const COPY_LOCALE = "en-US"

/** The month a frame closes, in full. */
export const frameMonth = (data: RaceData, m: number, locale = COPY_LOCALE) => monthName(data.frames[m].month, locale, "long")

function raceSummary(data: RaceData): string {
  const last = data.frames.length - 1
  const { finalOrder, strip } = raceGeometry(data.frames, { pitch: 1 })
  const standings = finalOrder.map((i, place) => `${data.series[i].title} ${PLACES[place]}`).join(", ")
  const runs = strip
    .filter((s) => s.leader !== null)
    .map((s) => {
      const title = data.series[s.leader!].title
      const from = frameMonth(data, s.start)
      return s.length === 1 ? `${title} in ${from}` : `${title} from ${from} to ${frameMonth(data, s.start + s.length - 1)}`
    })
  return `Final standings after ${frameMonth(data, last)}: ${standings}. Who led: ${runs.join(", then ")}.`
}

function raceTable(data: RaceData, facts: RewindFactsV3, settings: { locale: string }): PageTable {
  return {
    caption: `Minutes watched of your top series, added up month by month, from ${shown(facts, "window.from")} to ${shown(facts, "window.through")}.`,
    columns: ["Month", ...data.series.map((s) => s.title)],
    rows: data.frames.map((frame, m) => [
      frameMonth(data, m, settings.locale),
      ...frame.minutes.map((n) => (n > 0 ? formatRewindDuration(n, settings) : "not started")),
    ]),
  }
}

export const racePage: PageDefinition<RaceData> = {
  select: (_facts, { stats }) => {
    const { race } = stats
    if (!race.eligible) return null
    const index = new Map(race.series.map((s, i) => [s.key, i]))
    return {
      series: race.series.map(({ key, title }) => ({ key, title })),
      frames: race.months.map((month, m) => ({
        month,
        minutes: [...race.frames[m]],
        leader: race.leader[m] === null ? null : (index.get(race.leader[m]!) ?? null),
      })),
    }
  },
  schema: RaceDataSchema,
  srSummary: (data) => raceSummary(data),
  table: raceTable,
  article: (data, facts, ctx) => [heading(headline("race", facts), facts), ...figure(raceSummary(data)), ...tableBlock(raceTable(data, facts, ctx))],
  // The card's final standings (P7.6): the runners are the top series in rank order, so runner i is `series[i + 1]`.
  share: {
    facts: [
      "race.leadChanges", "race.overtakeMonth", "race.closestGapMinutes",
      ...[1, 2, 3, 4, 5].flatMap((n) => [`series[${n}].title`, `series[${n}].minutes`] as FactId[]),
    ],
    titles: [1, 2, 3, 4, 5].map((n) => `series[${n}].title` as FactId),
    titleKeys: ({ series }) => Object.fromEntries(series.map((s, i) => [`series[${i + 1}].title`, ratingKeyOf(s.key)])),
  },
}
