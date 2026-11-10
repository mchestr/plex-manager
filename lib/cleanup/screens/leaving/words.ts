/**
 * The words of a hold code, for the Leaving soon status sub "On hold" and
 * the History causes (TS 11.4, UX 8.7), and the arr app of a level. The
 * failure words live in `lib/cleanup/failure-words.ts`, which the audit
 * summary reads too. Server-only, as the screens loaders that use it.
 *
 * @module lib/cleanup/screens/leaving/words
 */

import "server-only"

import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { holdCodeWords } from "@/lib/cleanup/outcomes"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import { DEFAULT_LOCALE, formatTime } from "@/lib/utils/format"

/** The arr app of a level: Radarr holds movies, Sonarr shows and seasons. */
export const arrServiceOf = (level: string): "radarr" | "sonarr" => (level === "movie" ? "radarr" : "sonarr")

/**
 * The words of a hold code (`holdCodeWords`, TS 11.4). A `sourceFailed`
 * hold names the read time of that source when the newest library data
 * holds its failed read ("Sonarr did not answer at 3:07 AM"). A hold from
 * the act step's own read names no time.
 */
export function holdWords(sources: readonly SourceStatus[], zone: string): (code: string) => string {
  return (code) => {
    const service = /^sourceFailed:(\w+)$/.exec(code)?.[1]
    const readAt = sources.find((status) => status.service === service && status.state === "failed")?.readAt ?? null
    const time = readAt ? formatTime(readAt, { timeZone: zone, locale: DEFAULT_LOCALE }) : null
    return holdCodeWords(code, { service: (s) => SERVICE_NAMES[s], readAt: time })
  }
}
