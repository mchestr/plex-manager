/**
 * The construction of the heavy fixture: its titles, the plays each title
 * gets, the days the member watched, and the cumulative-minutes curve that
 * places the milestone dates. `heavy.ts` turns the plan into rows and holds
 * the hand-checked values; `fixtures/README.md` gives the arithmetic.
 *
 * - Series (31, 586 episodes, 52,320 minutes): the five race runners, whose
 *   plays are pinned to months, and 26 more watched twice through.
 * - Films (112 distinct, 194 plays, 26,100 minutes).
 * - 45 days off: 1 and 25 March around the 23-day streak, 4-12 May (the
 *   9-day gap), and 34 single days, so 289 of 334 days are active.
 *
 * @module evals/rewind/profiles/heavy-plan
 */

import { daysFrom } from "../dates"
import type { Film, Series } from "../rows"
import { episodes, film, listRun, series } from "../titles"

export interface Play {
  title: Film | Series
  season?: number
  episode?: number
  minutes: number
  percent?: number
  pausedSeconds?: number
}

/* --------------------------------------------------------------- Series */

export const rings = series(4001, "The Lord of the Rings: The Rings of Power", [8, 8])
export const severance = series(4002, "Severance", [9, 10])
export const sopranos = series(4003, "The Sopranos", [13, 13, 13, 13, 2])
export const breakingBad = series(4004, "Breaking Bad", [7, 13, 13, 13, 4])
export const thrones = series(4005, "Game of Thrones", [10, 10, 10, 10])

const OTHER_TITLES = listRun("series", "Only Murders in the Building", 31)
  .map((t) => t.title)
  .filter((title) => ![rings, severance, sopranos, breakingBad, thrones].some((s) => s.title === title))
  .slice(0, 26)

/** 17 series of 16 x 45 min, then 9 of 15 x 50 min; all watched twice except the last ep of the last two. */
export const others = OTHER_TITLES.map((title, i) => series(4010 + i, title, i < 17 ? [8, 8] : [8, 7]))

const pass = (s: Series, minutes: number, extra: Partial<Play> = {}): Play[] =>
  episodes(s).map((ep) => ({ title: s, ...ep, minutes, ...extra }))

/** Severance: three passes of 19 plus S1E1-E3 again, 60 plays of 55 minutes. */
export const severancePlays = [...pass(severance, 55), ...pass(severance, 55), ...pass(severance, 55), ...pass(severance, 55).slice(0, 3)]
/** Rings of Power: three passes of 16 at 70 minutes; the first November play stops at 60 (86%). */
export const ringsPlays = [...pass(rings, 70), ...pass(rings, 70), ...pass(rings, 70)].map((p, i) =>
  i === 32 ? { ...p, minutes: 60, percent: 86 } : p
)
export const sopranosPlays = pass(sopranos, 55, { pausedSeconds: 240 })
export const breakingBadPlays = pass(breakingBad, 50)
export const thronesPlays = pass(thrones, 58)

export const otherPlays = others.map((s, i) => {
  const minutes = i < 17 ? 45 : 50
  const second = pass(s, minutes)
  return [...pass(s, minutes), ...(i >= 24 ? second.slice(0, -1) : second)]
})

/* ---------------------------------------------------------------- Films */

const RUNTIMES = [95, 105, 115, 125, 135, 145, 155, 165]
/**
 * 112 films: the first 112 in the font subset, runtime by position, except
 * Dune: Part Two at 165 (its place gives 135): 14 x 1,040 + 30 = 14,590 minutes.
 */
export const films = listRun("film", "Dr. Strangelove or: How I Learned to Stop Worrying and Love the Bomb", 112).map((t, i) =>
  film(5001 + i, t.title, t.title === "Dune: Part Two" ? 165 : RUNTIMES[i % 8], { year: t.year })
)
export const dunePartTwo = films.find((f) => f.title === "Dune: Part Two")!

/**
 * Rewatches, 11,510 minutes: Dune: Part Two three more times (495); every
 * other 165, 155, 145, 135 and 125-minute film once (14 x 165 + 14 x 155 +
 * 14 x 145 + 13 x 135 + 14 x 125 = 10,015); two 115s, one 105 and seven 95s
 * (230 + 105 + 665).
 */
function rewatches(): Film[] {
  const byRuntime = (minutes: number) => films.filter((f) => f.minutes === minutes && f !== dunePartTwo)
  return [
    dunePartTwo,
    dunePartTwo,
    dunePartTwo,
    ...[165, 155, 145, 135, 125].flatMap(byRuntime),
    ...byRuntime(115).slice(0, 2),
    ...byRuntime(105).slice(0, 1),
    ...byRuntime(95).slice(0, 7),
  ]
}

export const filmPlays: Play[] = [...films, ...rewatches()].map((f) => ({ title: f, minutes: f.minutes }))

/* ----------------------------------------------------------------- Days */

const DAYS_OFF = new Set([
  "2026-01-09", "2026-01-18", "2026-01-27", "2026-02-05", "2026-02-14", "2026-02-23",
  "2026-03-01", "2026-03-25", "2026-04-03", "2026-04-12", "2026-04-21", "2026-04-30",
  ...daysFrom("2026-05-04", "2026-05-12"),
  "2026-05-21", "2026-05-30", "2026-06-02", "2026-06-08", "2026-06-17", "2026-06-26",
  "2026-07-06", "2026-07-15", "2026-07-24", "2026-08-02", "2026-08-11", "2026-08-15",
  "2026-08-20", "2026-08-29", "2026-09-07", "2026-09-16", "2026-09-25", "2026-10-04",
  "2026-10-13", "2026-10-22", "2026-10-31", "2026-11-09", "2026-11-18", "2026-11-27",
])

export const ACTIVE_DAYS = daysFrom("2026-01-01", "2026-11-30").filter((day) => !DAYS_OFF.has(day))

/**
 * The cumulative minutes aimed for at the end of each anchor day; the
 * milestone rungs (15,000, 30,000, 45,000 and 60,000 minutes) fall just
 * below each anchor, so each is crossed on the anchor day.
 */
export const ANCHORS: Array<[string, number]> = [
  ["2025-12-31", 0],
  ["2026-03-14", 15_120],
  ["2026-05-23", 30_120],
  ["2026-07-17", 45_120],
  ["2026-09-18", 60_120],
  ["2026-11-30", 78_420],
]
