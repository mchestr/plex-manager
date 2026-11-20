import "server-only"

import { plexSessionsSchema } from "@/lib/cleanup/schema/upstream"
import { runCall, type CleanupReadOptions } from "@/lib/cleanup/snapshot/rows"
import { isTransientFailure, serviceFetch, withRetry, type ServiceResult } from "@/lib/connections/http"

/**
 * What Plex plays right now, for the last pre-delete check (TS 8.8 row 7):
 * `GET /status/sessions` with the token in `X-Plex-Token`, 10 s.
 *
 * The answer is a set of every `ratingKey`, `parentRatingKey` and
 * `grandparentRatingKey` of the sessions, so one set answers for a movie copy,
 * a season and a show. Keys that are not digits (Live TV) are left out: no
 * library item has them. Users, players and addresses are never read.
 *
 * @module lib/connections/plex-playing
 */

const TIMEOUT_MS = 10_000
const DIGITS = /^\d+$/

/** The rating keys of every item that plays now, with their season and show keys. */
export async function readPlayingKeys(
  config: { url: string; token: string },
  opts: CleanupReadOptions = {}
): Promise<ServiceResult<Set<string>>> {
  const once = () =>
    serviceFetch({
      service: "Plex",
      url: `${config.url.replace(/\/+$/, "")}/status/sessions`,
      headers: { "X-Plex-Token": config.token },
      schema: plexSessionsSchema,
      timeoutMs: opts.timeoutMs ?? TIMEOUT_MS,
      signal: opts.signal,
    })
  const result = await runCall(opts, () => withRetry(once, { attempts: opts.attempts, signal: opts.signal, retryOn: isTransientFailure }))
  if (!result.ok) return result

  const keys = new Set<string>()
  for (const session of result.data.MediaContainer.Metadata) {
    for (const value of [session.ratingKey, session.parentRatingKey, session.grandparentRatingKey]) {
      if (value !== undefined && DIGITS.test(value)) keys.add(value)
    }
  }
  return { ok: true, data: keys }
}
