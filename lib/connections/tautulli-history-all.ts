import "server-only"

import type { z } from "zod"

import { historyPageSchema, historyRowSchema, recentHistoryRowSchema, type HistoryRow, type RecentHistoryRow } from "@/lib/cleanup/schema/upstream"
import {
  MAX_PAGES,
  namesTitle,
  newTally,
  parseRows,
  runCall,
  tooManyInvalid,
  type CleanupReadOptions,
  type OnRows,
  type RowsFailureCode,
} from "@/lib/cleanup/snapshot/rows"
import type { ServiceErrorCode, ServiceResult } from "@/lib/connections/http"
import { tautulliCommand } from "@/lib/connections/tautulli"
import type { TautulliParsed } from "@/lib/validations/tautulli"

/**
 * Tautulli's whole watch history for media cleanup, through `get_history`
 * (already a `TautulliCommand`) and `tautulliCommand`, which keeps the API
 * key out of every log and retries transient failures.
 *
 * Two forms:
 *
 * 1. The library read (T1, an empty query): `grouping=1`,
 *    `include_archived=1`, `include_activity=0`, oldest first by `started`,
 *    1000 rows a page until `recordsFiltered`, 20 s a page, at most 200
 *    pages (`PAGE_LIMIT`). One bad row that names a title (a rating key
 *    or a guid), or above 1 % bad rows, fails it with `ROWS_INVALID`: a
 *    lost play must read as unknown, never as "not played".
 * 2. The pre-delete read (TS 8.8 row 4, a query with `after` and
 *    `ratingKeys`): `include_activity=1`, newest first by `date`, 25 rows a
 *    page from `start=0`, the next page only while a page is full, at most
 *    8 pages. A full eighth page gives `complete: false`. A live session row
 *    has `row_id: null` and maybe `stopped: null`. Any bad row fails the read.
 *
 * Both drop a row whose `row_id` came before (a page edge can repeat a row).
 *
 * @module lib/connections/tautulli-history-all
 */

type TautulliEndpoint = Pick<TautulliParsed, "url" | "apiKey">

type HistoryReadCode = ServiceErrorCode | "TAUTULLI_ERROR" | RowsFailureCode | "INVALID_KEY"

/** One key column of `get_history` and its keys; Tautulli reads a comma list as `IN`. */
export interface HistoryKeyFilter {
  column: "rating_key" | "parent_rating_key" | "grandparent_rating_key"
  keys: readonly string[]
}

/** The pre-delete form. `after` is a day key, `YYYY-MM-DD`, in the server zone. */
export interface RecentHistoryQuery {
  after: string
  ratingKeys: HistoryKeyFilter
}

/** What a history read saw. `complete` is false when the page limit stopped a full read. */
interface HistoryPages {
  rows: number
  pages: number
  complete: boolean
}

type HistoryResult = ServiceResult<HistoryPages, HistoryReadCode>

const LIBRARY = { length: 1000, maxPages: MAX_PAGES, timeoutMs: 20_000 }
const RECENT = { length: 25, maxPages: 8, timeoutMs: 10_000 }
const DIGITS = /^\d+$/
const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/

/** The keys of a history row that name a title. */
const HISTORY_TITLE_FIELDS = [["rating_key"], ["parent_rating_key"], ["grandparent_rating_key"], ["guid"]] as const

async function readPages<T extends { row_id: string | null }>(
  config: TautulliEndpoint,
  params: Record<string, string | number>,
  form: typeof LIBRARY,
  schema: z.ZodType<T>,
  onRows: OnRows<T>,
  opts: CleanupReadOptions
): Promise<HistoryResult> {
  const tally = newTally()
  const seen = new Set<string>()
  let rows = 0
  for (let page = 0; page < form.maxPages; page++) {
    if (opts.signal?.aborted) return { ok: false, code: "ABORTED" }
    const start = page * form.length
    const query = { ...params, start, length: form.length }
    const timeoutMs = opts.timeoutMs ?? form.timeoutMs
    const result = await runCall(opts, () =>
      tautulliCommand(config, "get_history", query, historyPageSchema, { timeoutMs, signal: opts.signal, attempts: opts.attempts })
    )
    if (!result.ok) return result

    const raw = Array.isArray(result.data) ? result.data : result.data.data
    // A lost play of a title would read as "not played": fail the read instead (TS 7.8, correctness review C-08)
    let named = 0
    const parsed = parseRows("tautulli get_history", schema, raw, tally, (row) => {
      if (namesTitle(row, HISTORY_TITLE_FIELDS)) named += 1
    }).filter((row) => {
      if (row.row_id === null) return true
      if (seen.has(row.row_id)) return false
      seen.add(row.row_id)
      return true
    })
    // The pre-delete form decides on each page, so one bad row fails it at once.
    if (named > 0 || (form === RECENT && tally.dropped > 0)) return { ok: false, code: "ROWS_INVALID" }
    rows += parsed.length
    const stopped = (await onRows(parsed)) === false
    // T1 pages until `recordsFiltered`. The pre-delete form reads on while a page is full.
    const total = Array.isArray(result.data) || form === RECENT ? undefined : result.data.recordsFiltered
    const done = raw.length === 0 || (total === undefined ? raw.length < form.length : start + raw.length >= total)
    if (stopped || done) return tooManyInvalid(tally) ? { ok: false, code: "ROWS_INVALID" } : { ok: true, data: { rows, pages: page + 1, complete: true } }
  }
  if (form === LIBRARY) return { ok: false, code: "PAGE_LIMIT" }
  return { ok: true, data: { rows, pages: form.maxPages, complete: false } }
}

function isRecentQuery(query: Record<string, never> | RecentHistoryQuery): query is RecentHistoryQuery {
  return "after" in query
}

/** T1: every history row, oldest first, a page at a time. */
export function forEachHistoryRow(
  config: TautulliEndpoint,
  query: Record<string, never>,
  onRows: OnRows<HistoryRow>,
  opts?: CleanupReadOptions
): Promise<HistoryResult>
/** TS 8.8 row 4: the newest rows of some keys since the day `after`. */
export function forEachHistoryRow(
  config: TautulliEndpoint,
  query: RecentHistoryQuery,
  onRows: OnRows<RecentHistoryRow>,
  opts?: CleanupReadOptions
): Promise<HistoryResult>
export async function forEachHistoryRow(
  config: TautulliEndpoint,
  query: Record<string, never> | RecentHistoryQuery,
  onRows: OnRows<HistoryRow> | OnRows<RecentHistoryRow>,
  opts: CleanupReadOptions = {}
): Promise<HistoryResult> {
  const common = { grouping: 1, include_archived: 1 }
  if (!isRecentQuery(query)) {
    const params = { ...common, include_activity: 0, order_column: "started", order_dir: "asc" }
    return readPages(config, params, LIBRARY, historyRowSchema, onRows, opts)
  }

  const { after, ratingKeys } = query
  // An empty key list would read every title's history: refuse it.
  if (!DAY_KEY.test(after) || ratingKeys.keys.length === 0 || !ratingKeys.keys.every((k) => DIGITS.test(k))) {
    return { ok: false, code: "INVALID_KEY" }
  }
  const params = {
    ...common,
    include_activity: 1,
    order_column: "date",
    order_dir: "desc",
    after,
    [ratingKeys.column]: ratingKeys.keys.join(","),
  }
  // The overloads pair this query form with this row type.
  return readPages(config, params, RECENT, recentHistoryRowSchema, onRows as OnRows<RecentHistoryRow>, opts)
}
