/**
 * Calendar dots (design 5.3): the Weekend Double Feature's and the Casual
 * Critic's evidence graphic. The window is a grid of weeks, one column per
 * week and one row per weekday from Monday, one dot per day.
 *
 * ```
 *  M  · · ○ · · ·
 *  ...
 *  S  ● ● ○ ● ● ●     weekends solid: a played weekend day is a solid dot
 *  S  ● ○ ● ● ● ●
 * ```
 *
 * A played day is solid when `solid(weekday)` says so (the weekends, for the
 * Weekend Double Feature; every day, for the sparse Casual Critic) and an
 * outline otherwise; a day with nothing played is a small dot. Pure.
 *
 * @module lib/rewind/viz/calendar-dots
 */

type DotStep = "solid" | "outline" | "empty"

export interface CalendarDot {
  date: string
  cx: number
  cy: number
  r: number
  step: DotStep
}

const DAY_MS = 86_400_000
const r = (n: number) => Math.round(n * 100) / 100

/** 0 is Monday, 6 Sunday. @internal */
export const mondayIndex = (date: string) => (new Date(`${date}T00:00:00Z`).getUTCDay() + 6) % 7

export function calendarDots(
  days: ReadonlyArray<{ date: string; minutes: number }>,
  { width, height, solid }: { width: number; height: number; solid: (weekday: number) => boolean }
): { dots: CalendarDot[]; columns: number } {
  if (days.length === 0) return { dots: [], columns: 0 }
  const start = Date.parse(`${days[0].date}T00:00:00Z`)
  const lead = mondayIndex(days[0].date)
  const columns = Math.ceil((days.length + lead) / 7)
  const pitch = Math.min(width / columns, height / 7)
  const radius = pitch * 0.38
  const dots = days.map(({ date, minutes }) => {
    const slot = Math.round((Date.parse(`${date}T00:00:00Z`) - start) / DAY_MS) + lead
    const weekday = slot % 7
    const step: DotStep = minutes <= 0 ? "empty" : solid(weekday) ? "solid" : "outline"
    return {
      date,
      cx: r((Math.floor(slot / 7) + 0.5) * pitch),
      cy: r((weekday + 0.5) * pitch),
      r: r(step === "empty" ? radius * 0.35 : radius),
      step,
    }
  })
  return { dots, columns }
}
