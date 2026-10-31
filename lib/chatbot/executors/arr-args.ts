import "server-only"

/*
 * The Sonarr and Radarr tools' arguments, read defensively: they come from a
 * model, so a number may arrive as a string, out of range, or not at all.
 */

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  return typeof value === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(value) ? Number(value) : Number.NaN
}

/** A whole number from `min` to `max` (clamped), or `fallback` when the argument is not a number. */
export function wholeArg(value: unknown, fallback: number, max: number, min = 1): number {
  const n = toNumber(value)
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), min), max) : fallback
}

/** A whole number of at least `min` (an id is at least 1, a season at least 0), or `undefined`. */
export function wholeOrNone(value: unknown, min = 1): number | undefined {
  const n = toNumber(value)
  return Number.isInteger(n) && n >= min ? n : undefined
}

/** Trimmed text of at most `max` characters, or `undefined` when blank or not text. */
export function textArg(value: unknown, max = 100): string | undefined {
  const text = typeof value === "string" ? value.trim().slice(0, max) : ""
  return text === "" ? undefined : text
}

/** An optional argument: its value (none when left out), or an `Error:` line to return when it was given but cannot be read. */
type ArgRead<T> = { value?: T } | { error: string }

/** True when the model left an argument out: missing, null, or blank text. */
function leftOut(value: unknown): boolean {
  return value === undefined || value === null || (typeof value === "string" && value.trim() === "")
}

/**
 * An optional id or season: a whole number of at least `min`, or none when
 * left out. One given that is not such a number (an id of 0, -1, 1.5 or
 * "twelve") is an error, never no filter, so a bad id cannot widen a question
 * about one title to the whole server.
 */
export function optionalWhole(args: Record<string, unknown>, name: string, min = 1): ArgRead<number> {
  if (leftOut(args[name])) return {}
  const value = wholeOrNone(args[name], min)
  return value === undefined ? { error: `Error: '${name}' must be a whole number of at least ${min}, or left out` } : { value }
}

/** An optional title, as {@link textArg} reads it; a number is read as text (a show called "1883"), anything else is an error. */
export function optionalText(args: Record<string, unknown>, name: string, max = 100): ArgRead<string> {
  const given = args[name]
  if (leftOut(given)) return {}
  const value = textArg(typeof given === "number" && Number.isFinite(given) ? String(given) : given, max)
  return value === undefined ? { error: `Error: '${name}' must be text, or left out` } : { value }
}

const CALENDAR_DAYS = 7
const DAY_MS = 86_400_000

/**
 * The calendar's date range from `startDate` and `endDate`. Sonarr and Radarr
 * end a range with no end two days after today, whatever its start, so a
 * start a week out found nothing: an end not given is now 7 days after the
 * start (or after today), as the tools say.
 */
export function calendarRange(args: Record<string, unknown>, now = Date.now()): { start?: string; end?: string } {
  const start = textArg(args.startDate, 40)
  const weekLater = new Date((start === undefined ? now : Date.parse(start)) + CALENDAR_DAYS * DAY_MS)
  const end = textArg(args.endDate, 40) ?? (Number.isNaN(weekLater.getTime()) ? undefined : weekLater.toISOString().slice(0, 10))
  return { start, end }
}
