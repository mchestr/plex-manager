/**
 * Turns the heavy plan into dated plays: pins the race runners to their
 * months, fixes 4 July, fills every other active day from one queue towards
 * the cumulative curve, and sets start times.
 *
 * Start times: each day's plays run back to back with 10-minute gaps, the
 * last one starting late (22:10, 22:40, 23:05 or 22:55 in turn, tuned so 34%
 * of plays start after 10 PM). On some days the first play moves to an early
 * hour (00:20 to 04:10, or 06:40 to 09:10), so 5 AM is the first hour with
 * no start.
 *
 * @module evals/rewind/profiles/heavy-schedule
 */

import { addMinutes } from "../dates"
import {
  ACTIVE_DAYS,
  ANCHORS,
  breakingBadPlays,
  dunePartTwo,
  filmPlays,
  otherPlays,
  ringsPlays,
  severancePlays,
  sopranosPlays,
  thronesPlays,
  type Play,
} from "./heavy-plan"

export interface DatedPlay extends Play {
  /** `YYYY-MM-DDTHH:mm` in America/Chicago. */
  at: string
}

const JULY_4 = "2026-07-04"
const DAY_CAP = 600
const LAST_STARTS = ["22:10", "22:40", "23:05", "22:55"]

const daysOf = (month: number, from = 1, to = 31) =>
  ACTIVE_DAYS.filter((d) => Number(d.slice(5, 7)) === month && Number(d.slice(8)) >= from && Number(d.slice(8)) <= to)

/** Spread `plays` over `days`, the i-th on day floor((i + offset) * days / plays). */
function spread(plays: Play[], days: string[], offset: number, into: Map<string, Play[]>) {
  plays.forEach((play, i) => {
    const day = days[Math.floor(((i + offset) * days.length) / plays.length)]
    into.set(day, [...(into.get(day) ?? []), play])
  })
}

function pinned(): Map<string, Play[]> {
  const days = new Map<string, Play[]>()
  for (let month = 1; month <= 10; month++) {
    const active = daysOf(month)
    const sev = severancePlays.slice(6 * (month - 1), 6 * month)
    days.set(active[Math.floor(active.length / 4)], [...(days.get(active[Math.floor(active.length / 4)]) ?? []), ...sev.slice(0, 3)])
    days.set(active[Math.floor((3 * active.length) / 4)], [...(days.get(active[Math.floor((3 * active.length) / 4)]) ?? []), ...sev.slice(3)])
    spread(sopranosPlays.slice(5 * (month - 1), 5 * month), active, 0.2, days)
    spread(breakingBadPlays.slice(5 * (month - 1), 5 * month), active, 0.5, days)
    const got = thronesPlays.slice(4 * (month - 1), 4 * month)
    if (month === 7) {
      spread(got.slice(3), active.filter((d) => d !== JULY_4), 0.8, days)
    } else {
      spread(got, active, 0.8, days)
    }
  }
  spread(sopranosPlays.slice(50), daysOf(11), 0.2, days)
  spread(ringsPlays.slice(0, 16), daysOf(9), 0.1, days)
  days.set("2026-10-06", [...(days.get("2026-10-06") ?? []), ...ringsPlays.slice(16, 20)])
  spread(ringsPlays.slice(20, 32), daysOf(10, 7), 0.5, days)
  spread(ringsPlays.slice(32, 46), daysOf(11, 1, 26), 0.5, days)
  days.set("2026-11-28", [...(days.get("2026-11-28") ?? []), ringsPlays[46]])
  days.set("2026-11-29", [...(days.get("2026-11-29") ?? []), ringsPlays[47]])
  return days
}

/** 4 July: three films, three Game of Thrones episodes, then a fourth film: 744 minutes. */
function july4(queue: Play[]): Play[] {
  const take = (minutes: number) => {
    // A rewatch, so each film's first play stays in its place in the queue.
    let index = queue.length - 1
    while (!("minutes" in queue[index].title && queue[index].minutes === minutes && queue[index].title !== dunePartTwo)) index--
    return queue.splice(index, 1)[0]
  }
  const films = [take(165), take(155), take(145), take(105)]
  return [...films.slice(0, 3), ...thronesPlays.slice(24, 27), films[3]]
}

/** The filler queue: every other series' first pass, then their second, with films mixed in evenly. */
function fillerQueue(): Play[] {
  const episodes = [...otherPlays.map((p) => p.slice(0, p.length / 2 + (p.length % 2))), ...otherPlays.map((p) => p.slice(p.length / 2 + (p.length % 2)))].flat()
  const films = [...filmPlays]
  const queue: Play[] = []
  let e = 0
  let f = 0
  while (e < episodes.length || f < films.length) {
    if (f < films.length && (e >= episodes.length || f / films.length <= e / episodes.length)) queue.push(films[f++])
    else queue.push(episodes[e++])
  }
  return queue
}

function target(day: string): number {
  const i = ANCHORS.findIndex(([date]) => date >= day)
  const [fromDay, fromValue] = ANCHORS[i - 1]
  const [toDay, toValue] = ANCHORS[i]
  const span = (Date.parse(toDay) - Date.parse(fromDay)) / 86_400_000
  return fromValue + ((toValue - fromValue) * (Date.parse(day) - Date.parse(fromDay))) / 86_400_000 / span
}

const EARLY: Array<[number, number, string]> = [
  [29, 3, "01:10"],
  [29, 10, "02:20"],
  [29, 17, "03:30"],
  [29, 24, "00:20"],
  [37, 5, "04:10"],
  [31, 7, "06:40"],
  [31, 14, "07:30"],
  [31, 21, "08:20"],
  [31, 28, "09:10"],
]

const span = (p: Play) => p.minutes + Math.ceil((p.pausedSeconds ?? 0) / 60)

function timeDay(day: string, index: number, fillers: Play[], race: Play[]): DatedPlay[] {
  const early = day === JULY_4 ? undefined : EARLY.find(([mod, at]) => index % mod === at)
  const moved = early && fillers.length > 0 ? { ...fillers[0], at: `${day}T${early[2]}` } : null
  const rest = [...(moved ? fillers.slice(1) : fillers), ...race]
  const starts: string[] = []
  let start = LAST_STARTS[index % LAST_STARTS.length]
  for (let j = rest.length - 1; j >= 0; j--) {
    starts[j] = start
    if (j > 0) start = addMinutes(start, -(span(rest[j - 1]) + 10))
  }
  if (moved && rest.length > 0 && addMinutes(moved.at.slice(11), span(moved)) > starts[0]) throw new Error(`${day}: early play overlaps`)
  return [...(moved ? [moved] : []), ...rest.map((p, j) => ({ ...p, at: `${day}T${starts[j]}` }))]
}

/** Every 2026 play of the heavy member, in order. */
export function heavySchedule(): DatedPlay[] {
  const race = pinned()
  const queue = fillerQueue()
  race.set(JULY_4, july4(queue))
  const plays: DatedPlay[] = []
  let total = 0
  ACTIVE_DAYS.forEach((day, index) => {
    const own = race.get(day) ?? []
    let minutes = own.reduce((sum, p) => sum + p.minutes, 0)
    total += minutes
    const fillers: Play[] = []
    const last = index === ACTIVE_DAYS.length - 1
    while (day !== JULY_4 && queue.length > 0) {
      const next = queue[0]
      const fits = total + next.minutes <= target(day) && minutes + next.minutes <= DAY_CAP
      if (!last && !fits && (fillers.length > 0 || own.length > 0)) break
      fillers.push(queue.shift()!)
      minutes += next.minutes
      total += next.minutes
    }
    if (day !== JULY_4 && minutes >= 744) throw new Error(`${day} holds ${minutes} minutes, not under 4 July's 744`)
    plays.push(...timeDay(day, index, fillers, own))
  })
  if (queue.length > 0) throw new Error(`${queue.length} plays left unscheduled`)
  return plays
}
