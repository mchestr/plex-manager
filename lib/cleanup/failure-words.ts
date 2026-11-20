/**
 * The words of a delete failure code (TS 8.9, 11.3, 11.4): the one table that
 * the `CLEANUP_ITEM_FAILED` audit summary, the Leaving soon "Failed" sub and
 * the History causes read. Server-only: the service error words come from
 * `lib/connections/http.ts`.
 *
 * A failure code is the act step's `failCode` or the `detail.code` of a
 * `failed` outcome: a service error code (`HTTP`, `TIMEOUT`, ...), a season
 * stop (`noSeasonNumber`, `noArrSeason`, `outsideArrPath`), or
 * `sourceFailed:<service>`. Any other code reads "The delete failed", so a
 * stored code never shows raw. The words have no final period.
 *
 * @module lib/cleanup/failure-words
 */

import "server-only"

import { SERVICE_NAMES } from "@/lib/cleanup/fields/words"
import { serviceErrorMessage, type ServiceErrorCode } from "@/lib/connections/http"
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

/** The words of a failure code. `service` is the arr app that failed; `status` is the HTTP status of an `HTTP` failure. */
export function failureWords(code: string, service: Service, status?: number): string {
  const name = SERVICE_NAMES[service]
  const source = /^sourceFailed:(\w+)$/.exec(code)?.[1]
  if (source !== undefined) return isService(source) ? `${SERVICE_NAMES[source]} did not answer` : "The delete failed"
  const stop = STOP_WORDS.get(code)
  if (stop) return stop(name)
  return SERVICE_ERRORS.has(code) ? serviceErrorMessage(name, { ok: false, code, status }) : "The delete failed"
}
