/**
 * Plain calendar arithmetic on `YYYY-MM-DD` keys for the fixture builders.
 * Kept separate from `lib/wrapped/stats/days.ts` so the fixtures are not
 * built with the code they check.
 *
 * @module evals/rewind/dates
 */

const DAY_MS = 86_400_000
const toUtc = (key: string) => Date.parse(`${key}T00:00:00Z`)

/** `key` moved by `days`. */
export function shift(key: string, days: number): string {
  return new Date(toUtc(key) + days * DAY_MS).toISOString().slice(0, 10)
}

/** Every day from `from` to `to`, both included. */
export function daysFrom(from: string, to: string): string[] {
  const days: string[] = []
  for (let key = from; key <= to; key = shift(key, 1)) days.push(key)
  return days
}

/** `HH:mm` after adding `minutes` to `time`; must stay within the day. */
export function addMinutes(time: string, minutes: number): string {
  const [h, m] = time.split(":").map(Number)
  const total = h * 60 + m + minutes
  if (total < 0 || total >= 1440) throw new RangeError(`${time} + ${minutes} leaves the day`)
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`
}
