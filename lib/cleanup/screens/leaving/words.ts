/**
 * The words of a failure code and a hold code, for the Leaving soon status
 * subs ("Failed", "On hold") and the History causes (TS 8.9, 11.4, UX 8.7).
 * Server-only: the service error words come from `lib/connections/http.ts`.
 *
 * A failure code is the act step's `failCode` or the `detail.code` of a
 * `failed` outcome: a service error code (`HTTP`, `TIMEOUT`, ...), a season
 * stop (`noSeasonNumber`, `noArrSeason`, `outsideArrPath`), or
 * `sourceFailed:<service>`. Any other code reads "The delete failed", so a
 * stored code never shows raw.
 *
 * @module lib/cleanup/screens/leaving/words
 */

import "server-only"

import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { holdCodeWords } from "@/lib/cleanup/outcomes"
import type { SourceStatus } from "@/lib/cleanup/schema/snapshot"
import { serviceErrorMessage, type ServiceErrorCode } from "@/lib/connections/http"
import { DEFAULT_LOCALE, formatTime } from "@/lib/utils/format"
import { SERVICES, type Service } from "@/lib/validations/cleanup-vocabulary"

const SERVICE_ERRORS = new Set<string>(["TIMEOUT", "ABORTED", "NETWORK", "HTTP", "REDIRECT_BLOCKED", "INVALID_RESPONSE",
  "UPSTREAM_ERROR"] satisfies ServiceErrorCode[])

/** The season stops of TS 8.9, with the cause words of TS 6.9. */
const STOP_WORDS = new Map<string, (service: string) => string>([
  ["noSeasonNumber", () => "The season has no number"],
  ["noArrSeason", () => "Sonarr has no such season"],
  ["outsideArrPath", (service) => `The file is outside ${service}'s root folders`],
])

const isService = (value: string): value is Service => (SERVICES as readonly string[]).includes(value)

/** The arr app of a level: Radarr holds movies, Sonarr shows and seasons. */
export const arrServiceOf = (level: string): "radarr" | "sonarr" => (level === "movie" ? "radarr" : "sonarr")

/** The words of a failure code, with no final period. `service` is the arr app that failed. */
export function failureWords(code: string, service: Service): string {
  const name = SERVICE_NAMES[service]
  const source = /^sourceFailed:(\w+)$/.exec(code)?.[1]
  if (source !== undefined) return isService(source) ? `${SERVICE_NAMES[source]} did not answer` : "The delete failed"
  const stop = STOP_WORDS.get(code)
  if (stop) return stop(name)
  return SERVICE_ERRORS.has(code) ? serviceErrorMessage(name, { ok: false, code }) : "The delete failed"
}

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
