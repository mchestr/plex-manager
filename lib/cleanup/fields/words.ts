/**
 * The shared words of media cleanup (TS 4.2, UX 2 and 5.8): level names and
 * nouns, service names, duration, size and requester list words, and the two
 * list joins. Client-safe.
 *
 * @module lib/cleanup/fields/words
 */

import type { DescribeWords } from "@/lib/cleanup/engine/types"
import type { Form } from "@/lib/cleanup/fields/types"
import type { Duration, RequesterRef } from "@/lib/validations/cleanup-rule"
import { DEFAULT_LOCALE, formatDate, formatDayKey } from "@/lib/utils/format"
import { type DurationUnit, GiB, type Level, type Service, TiB } from "@/lib/validations/cleanup-vocabulary"

/** The UI name of each level (UX 5.2): "Clean up Movies". */
export const LEVEL_NAMES: Record<Level, string> = { movie: "Movies", show: "Whole shows", season: "Seasons" }

/** A noun that `plural()` counts: a level, or a title or item of any level. */
export type Noun = Level | "title" | "item"

/** The singular and plural of each noun. The level words are the legend words of UX 5.2. */
export const NOUNS: Record<Noun, readonly [string, string]> = {
  movie: ["movie", "movies"],
  show: ["show", "shows"],
  season: ["season", "seasons"],
  title: ["title", "titles"],
  item: ["item", "items"],
}

/** The noun alone, singular at 1: "movie", "movies". */
export const nounWord = (count: number, noun: Noun): string => NOUNS[noun][count === 1 ? 0 : 1]

/** The display name of each service. */
export const SERVICE_NAMES: Record<Service, string> = {
  plex: "Plex",
  tautulli: "Tautulli",
  overseerr: "Overseerr",
  radarr: "Radarr",
  sonarr: "Sonarr",
}

const UNIT_WORDS: Record<DurationUnit, readonly [string, string]> = {
  days: ["day", "days"],
  weeks: ["week", "weeks"],
  months: ["month", "months"],
  years: ["year", "years"],
}

/** "{amount} {unit}", with the unit singular at 1: "1 year", "365 days" (TS 4.2). */
export function durationWords(d: Duration): string {
  return `${d.amount} ${UNIT_WORDS[d.unit][d.amount === 1 ? 0 : 1]}`
}

/** `formatBytes` rounding, in the unit the admin chose: "20 GB", "1.5 TB" (TS 4.2). */
export function sizeWords(bytes: number, unit: "GB" | "TB"): string {
  return `${parseFloat((bytes / (unit === "TB" ? TiB : GiB)).toFixed(2))} ${unit}`
}

/** A day key or an instant as "Jun 14, 2022". An instant reads in `zone` (UTC when unset). */
export function dateWords(value: string, zone = "UTC"): string {
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return formatDayKey(value, "short", { locale: DEFAULT_LOCALE })
  return formatDate(value, "short", { timeZone: zone, locale: DEFAULT_LOCALE })
}

/** "a", "a or b", "a, b or c". */
export function joinOr(parts: readonly string[]): string {
  return joinLast(parts, " or ")
}

/** "a", "a and b", "a, b and c". */
export function joinAnd(parts: readonly string[]): string {
  return joinLast(parts, " and ")
}

function joinLast(parts: readonly string[], last: string): string {
  if (parts.length <= 1) return parts.join("")
  return `${parts.slice(0, -1).join(", ")}${last}${parts[parts.length - 1]}`
}

const PLURAL_VERBS = { were: "were", have: "have", are: "are", their: "their" } as const
const SINGULAR_VERBS = { were: "was", have: "has", are: "is", their: "its" } as const

/** The verbs of a predicate: "were", "have", "are" and "their" in the plural, "was", "has", "is" and "its" in the singular. */
export const verbs = (form: Form): Record<keyof typeof PLURAL_VERBS, string> => (form === "plural" ? PLURAL_VERBS : SINGULAR_VERBS)

/** The name of a member with no name or no row (X8). */
export const UNKNOWN_MEMBER = "Unknown member"

/** One requester ref as list words (UX 5.8): "any member", "former members", "members inactive for 90 days", a name. @internal */
export function requesterRefWords(ref: RequesterRef, words?: DescribeWords): string {
  switch (ref.kind) {
    case "anyMember":
      return "any member"
    case "former":
      return "former members"
    case "inactive":
      return `members inactive for ${durationWords({ amount: ref.days, unit: "days" })}`
    case "member":
      return words?.memberName(ref.userId) ?? UNKNOWN_MEMBER
  }
}

/** The requester list words, joined with ", " and " or " before the last one (TS 4.2). */
export function requesterWords(refs: readonly RequesterRef[], words?: DescribeWords): string {
  return joinOr(refs.map((ref) => requesterRefWords(ref, words)))
}
