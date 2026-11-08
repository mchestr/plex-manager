import "server-only"

import { z } from "zod"

import { seerrRequestPageSchema, seerrRequestSchema, type SeerrRequest } from "@/lib/cleanup/schema/upstream"
import {
  MAX_PAGES,
  newTally,
  parseRows,
  runCall,
  tooManyInvalid,
  type CleanupReadOptions,
  type OnRows,
  type RowsFailureCode,
} from "@/lib/cleanup/snapshot/rows"
import { isTransientFailure, serviceFetch, withRetry, type ServiceErrorCode, type ServiceResult } from "@/lib/connections/http"
import type { OverseerrEndpoint } from "@/lib/connections/overseerr"

/**
 * The Overseerr (Seerr) calls of media cleanup: every request (TS 7.2.2 O2)
 * and the availability sync job after a deletion (TS 8.11 item 2). The user
 * index (O1) is `buildOverseerrUserIndex` in `./overseerr`.
 *
 * - `X-Api-Key` header, a Zod schema, 20 s a page and the caller's signal.
 *   Logs carry the host and the path only (`serviceFetch`).
 * - The request read retries transient failures. The job call is a `POST`
 *   and never retries.
 * - Only these two routes exist here. This module never removes anything in
 *   Overseerr (TS 8.9, lead decision 4).
 *
 * @module lib/connections/overseerr-cleanup
 */

export type RequestReadCode = ServiceErrorCode | RowsFailureCode

export interface RequestReadOptions extends CleanupReadOptions {
  /**
   * Read newest first and stop at the first request created before this time
   * (TS 8.8 step 5.4). Without it, the read is O2: oldest first, every
   * request, so a new request during the read does not move the page edges.
   */
  until?: Date | number
}

/** Seerr's job ids that cleanup may start (`server/job/schedule.ts`). */
export type OverseerrJobId = "availability-sync"

const TAKE = 100
const PAGE_TIMEOUT_MS = 20_000
const JOB_TIMEOUT_MS = 15_000

function seerrUrl(config: OverseerrEndpoint, path: string): string {
  return `${config.url.replace(/\/+$/, "")}/api/v1${path}`
}

/**
 * Every request, 100 a page (`sort=added`, `filter=all`), handed to `onRows`.
 * A request id seen before is dropped. Above 1 % bad rows the read fails with
 * `ROWS_INVALID`, and after 200 pages with `PAGE_LIMIT`. A request whose
 * `createdAt` does not parse is kept, so it can still rescue a title.
 */
export async function forEachRequest(
  config: OverseerrEndpoint,
  onRows: OnRows<SeerrRequest>,
  opts: RequestReadOptions = {}
): Promise<ServiceResult<{ rows: number; pages: number }, RequestReadCode>> {
  const until = opts.until === undefined ? undefined : Number(opts.until)
  const tally = newTally()
  const seen = new Set<number>()
  let rows = 0
  for (let page = 0; page < MAX_PAGES; page++) {
    if (opts.signal?.aborted) return { ok: false, code: "ABORTED" }
    const query = new URLSearchParams({
      take: String(TAKE),
      skip: String(page * TAKE),
      sort: "added",
      sortDirection: until === undefined ? "asc" : "desc",
      filter: "all",
    })
    const once = () =>
      serviceFetch({
        service: "Overseerr",
        url: seerrUrl(config, `/request?${query}`),
        headers: { "X-Api-Key": config.apiKey },
        schema: seerrRequestPageSchema,
        timeoutMs: opts.timeoutMs ?? PAGE_TIMEOUT_MS,
        signal: opts.signal,
      })
    const result = await runCall(opts, () => withRetry(once, { attempts: opts.attempts, signal: opts.signal, retryOn: isTransientFailure }))
    if (!result.ok) return result

    let older = false
    const parsed = parseRows("overseerr requests", seerrRequestSchema, result.data.results, tally).filter((request) => {
      if (seen.has(request.id)) return false
      seen.add(request.id)
      if (until !== undefined && Date.parse(request.createdAt) < until) older = true
      return !older
    })
    rows += parsed.length
    const stopped = (await onRows(parsed)) === false
    const done = older || result.data.results.length === 0 || result.data.pageInfo.page >= result.data.pageInfo.pages
    if (stopped || done) return tooManyInvalid(tally) ? { ok: false, code: "ROWS_INVALID" } : { ok: true, data: { rows, pages: page + 1 } }
  }
  return { ok: false, code: "PAGE_LIMIT" }
}

/**
 * Start a Seerr job now: `POST /api/v1/settings/jobs/{jobId}/run`. The API
 * key acts as the admin. The answer's body is not read. Never retried.
 */
export async function runOverseerrJob(
  config: OverseerrEndpoint,
  jobId: OverseerrJobId,
  opts: Pick<CleanupReadOptions, "signal" | "run" | "timeoutMs"> = {}
): Promise<ServiceResult<null>> {
  const result = await runCall(opts, () =>
    serviceFetch({
      service: "Overseerr",
      url: seerrUrl(config, `/settings/jobs/${jobId}/run`),
      method: "POST",
      headers: { "X-Api-Key": config.apiKey },
      schema: z.string(),
      responseType: "text",
      timeoutMs: opts.timeoutMs ?? JOB_TIMEOUT_MS,
      signal: opts.signal,
    })
  )
  return result.ok ? { ok: true, data: null } : result
}
