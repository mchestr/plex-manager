/**
 * The golden fixtures' December (P8.5): a deterministic extension of each
 * fixture's plays into December, for the final cut's golden test.
 *
 * A member who played in the last week of November keeps going: their plays
 * of 3 to 30 November repeat four weeks later, on 1 to 28 December, so
 * weekdays and hours keep their shape and the numbers grow. A member who had
 * stopped before then gets no December. Two fixtures are written to change
 * what their copy depends on, as a real December does for a few members:
 *
 * - `heavy` binges its No. 2 series again over the holidays, which takes the
 *   No. 1 spot (`series[1].title` changes);
 * - `night-owl` watches December again in the afternoons, which moves
 *   `hours.afterDarkShare` below its band.
 *
 * `generate-fixtures.ts --december` writes `fixtures/december/<id>.json`,
 * and the final cut's golden test checks them against this builder.
 *
 * @module evals/rewind/december
 */

import { formatDayKey, wallTimeToInstant } from "@/lib/utils/zoned-time"
import { dayKey, resolveZone } from "@/lib/wrapped/time/zone"

import type { Fixture } from "./fixture-schema"
import type { HistoryRow } from "./rows"

const SHIFT_S = 28 * 86_400

/** One fixture's December plays. */
export interface DecemberExtension {
  fixture: string
  history: HistoryRow[]
}

type Row = Record<string, unknown>

const startedOf = (row: Row) => Number(row.started)
const zoneOf = (fixture: Fixture) => resolveZone({ timezone: fixture.member.timezone }, fixture.server.zone).zone
const pad = (n: number) => String(n).padStart(2, "0")

/** The row moved to start at `started` (seconds), keeping its length. */
const startingAt = (row: Row, started: number): HistoryRow =>
  ({ ...row, started, stopped: started + Number(row.stopped) - startedOf(row) }) as HistoryRow

/** The instant, in seconds, of `HH:00` on `day` of December in `zone`. */
const decemberAt = (year: number, day: number, hour: number, zone: string) =>
  wallTimeToInstant(`${formatDayKey(year, 12, day)}T${pad(hour)}:00`, zone).getTime() / 1000

/** The plays whose day in the member's zone falls from `from` to `to` (`MM-DD`) of the year. */
function playsBetween(fixture: Fixture, from: string, to: string): Row[] {
  const zone = zoneOf(fixture)
  const year = fixture.window.year
  return fixture.history.filter((row) => {
    const day = dayKey(startedOf(row) * 1000, zone)
    return day >= `${year}-${from}` && day <= `${year}-${to}`
  })
}

/** Minutes per series, by grandparent rating key. */
function seriesMinutes(rows: readonly Row[]): Array<[string, number]> {
  const minutes = new Map<string, number>()
  for (const row of rows) {
    if (row.media_type !== "episode") continue
    const key = String(row.grandparent_rating_key)
    minutes.set(key, (minutes.get(key) ?? 0) + Number(row.play_duration) / 60)
  }
  return [...minutes].sort((a, b) => b[1] - a[1])
}

/** `heavy`: the No. 2 series' plays of the year again from 1 December, evenings, until it leads. */
function holidayBinge(fixture: Fixture, base: HistoryRow[]): HistoryRow[] {
  const [first, second] = seriesMinutes([...fixture.history, ...base])
  if (!first || !second) return base
  const zone = zoneOf(fixture)
  const plays = fixture.history.filter((row) => row.media_type === "episode" && String(row.grandparent_rating_key) === second[0])
  const extra: HistoryRow[] = []
  let gained = 0
  for (const [i, row] of plays.entries()) {
    const hour = 17 + Math.floor(i / 28)
    if (gained > first[1] - second[1] || hour > 21) break
    extra.push(startingAt(row, decemberAt(fixture.window.year, (i % 28) + 1, hour, zone)))
    gained += Number(row.play_duration) / 60
  }
  return [...base, ...extra]
}

/** `night-owl`: December's plays again, at 14:00 the same day: the holidays bring the afternoons. */
function afternoons(fixture: Fixture, base: HistoryRow[]): HistoryRow[] {
  const zone = zoneOf(fixture)
  const day = (row: Row) => Number(dayKey(startedOf(row) * 1000, zone).slice(8))
  return [...base, ...base.map((row) => startingAt(row, decemberAt(fixture.window.year, day(row), 14, zone)))]
}

const TWEAKS: Readonly<Record<string, (fixture: Fixture, base: HistoryRow[]) => HistoryRow[]>> = {
  heavy: holidayBinge,
  "night-owl": afternoons,
}

/** Builds one fixture's December; see the module comment. */
export function decemberExtension(fixture: Fixture): DecemberExtension {
  if (playsBetween(fixture, "11-24", "11-30").length === 0) return { fixture: fixture.id, history: [] }
  const base = playsBetween(fixture, "11-03", "11-30").map((row) => startingAt(row, startedOf(row) + SHIFT_S))
  const tweak = TWEAKS[fixture.id]
  return { fixture: fixture.id, history: tweak ? tweak(fixture, base) : base }
}

/**
 * The fixture as its final cut reads it: the full-year window, with December's plays.
 * @internal
 */
export function withDecember(fixture: Fixture, december: DecemberExtension): Fixture {
  return { ...fixture, window: { ...fixture.window, finalCut: true }, history: [...fixture.history, ...december.history] }
}
