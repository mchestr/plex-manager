/**
 * Watch history from Tautulli's `get_history` (design 7.2, RWP-05, BP-24).
 *
 * ## One read
 *
 * 1. `get_history` with `after` and `before` from `paddedDateRange` (the
 *    window's dates in the Rewind zone, a day wider each side), `grouping=1`,
 *    oldest first and `length=1000`; per member with `user_id`, or server-wide
 *    without it.
 * 2. Page with `start` until `recordsFiltered` rows are read, at most 200
 *    pages. A flat-array response is one complete page. Each page goes through
 *    `ctx.limiter` with a 20 s budget.
 * 3. Validate each row, map it to a {@link PlayEvent}, drop the admin's
 *    excluded library sections, and trim to the window by instant.
 *
 * Hidden titles and content ratings are not applied here: hidden titles still
 * count toward totals, and history rows carry no content rating (P2.6 applies
 * the rating exclusions once the library pass has stored each title's).
 * Neither `get_item_user_stats` nor `get_home_stats` is called.
 *
 * @module lib/wrapped/sources/tautulli-history
 */

import "server-only"

import { tautulliCommand } from "@/lib/connections/tautulli"
import { inWindow, paddedDateRange, type TimeWindow } from "@/lib/wrapped/time/zone"

import { parseRows, tooManyInvalid, type RowTally } from "./rows"
import { tautulliHistoryDataSchema, tautulliHistoryRowSchema, type TautulliHistoryRow } from "./schemas"
import {
  runLimited,
  type PlayEvent,
  type RewindUser,
  type SourceContext,
  type SourceResult,
  type WatchHistorySource,
} from "./watch-history-source"

const PAGE_LENGTH = 1000
const MAX_PAGES = 200
const PAGE_TIMEOUT_MS = 20_000

export interface TautulliHistoryOptions {
  config: { url: string; apiKey: string }
  /** `Config.rewindExcludedSectionIds`, parsed with `excludedSectionIdsSchema`. */
  excludedSectionIds: readonly string[]
}

export interface TautulliHistorySource extends WatchHistorySource {
  /** Every member's plays in the window, for P2.6's server-wide aggregate. */
  fetchServerYear(window: TimeWindow, ctx: SourceContext): Promise<SourceResult<PlayEvent[]>>
  /** The member's plays with no date filter: only for `member.since` and the 2025 comparison. */
  fetchLifetime(user: RewindUser, ctx: SourceContext): Promise<SourceResult<PlayEvent[]>>
}

const MEDIA_TYPES = new Set(["movie", "episode", "track"])
const TRANSCODE_DECISIONS = new Set(["direct play", "copy", "transcode"])
const LOCATIONS = new Set(["lan", "wan"])

function oneOf<T extends string>(allowed: ReadonlySet<string>, value: string | null): T | null {
  return value !== null && allowed.has(value) ? (value as T) : null
}

/**
 * Map a validated row to a {@link PlayEvent}, or `null` when its library
 * section is excluded. Seconds become epoch ms; minutes come from
 * `play_duration`, never `viewed_duration` (which does not exist).
 *
 * Exported for P2.10's fixture source and the tests.
 */
export function toPlayEvent(row: TautulliHistoryRow, excludedSectionIds: ReadonlySet<string>): PlayEvent | null {
  if (row.section_id !== null && excludedSectionIds.has(row.section_id)) return null
  return {
    ratingKey: row.rating_key,
    grandparentRatingKey: row.grandparent_rating_key,
    parentMediaIndex: row.parent_media_index,
    mediaIndex: row.media_index,
    mediaType: MEDIA_TYPES.has(row.media_type) ? (row.media_type as PlayEvent["mediaType"]) : "other",
    title: row.title,
    grandparentTitle: row.grandparent_title,
    year: row.year,
    originallyAvailableAt: row.originally_available_at,
    startedAt: row.started * 1000,
    stoppedAt: row.stopped * 1000,
    playSeconds: row.play_duration,
    pausedSeconds: row.paused_counter,
    percentComplete: row.percent_complete,
    watchedStatus: row.watched_status,
    transcodeDecision: oneOf(TRANSCODE_DECISIONS, row.transcode_decision),
    location: oneOf(LOCATIONS, row.location),
    platform: row.platform,
    product: row.product,
    guid: row.guid,
    librarySectionId: row.section_id ?? "",
    contentRating: null,
    live: row.live === 1,
  }
}

type HistoryFilter = { user_id?: string; after?: string; before?: string }

/** Every `get_history` row matching `filter`, validated. @internal */
async function readHistory(
  options: TautulliHistoryOptions,
  filter: HistoryFilter,
  ctx: SourceContext
): Promise<SourceResult<TautulliHistoryRow[]>> {
  const rows: TautulliHistoryRow[] = []
  const tally: RowTally = { read: 0, dropped: 0 }
  let start = 0

  for (let page = 0; page < MAX_PAGES; page++) {
    if (ctx.signal?.aborted) return { ok: false, code: "ABORTED" }
    const params = { ...filter, grouping: 1, order_column: "started", order_dir: "asc", start, length: PAGE_LENGTH }
    const result = await runLimited(ctx, "tautulli", () =>
      tautulliCommand(options.config, "get_history", params, tautulliHistoryDataSchema, {
        timeoutMs: PAGE_TIMEOUT_MS,
        signal: ctx.signal,
      })
    )
    if (!result.ok) return result

    const data = result.data
    const raw = Array.isArray(data) ? data : data.data
    rows.push(...parseRows("tautulli get_history", tautulliHistoryRowSchema, raw, tally))
    start += raw.length

    if (Array.isArray(data) || raw.length === 0 || start >= data.recordsFiltered) {
      return tooManyInvalid(tally) ? { ok: false, code: "ROWS_INVALID" } : { ok: true, data: rows }
    }
  }
  return { ok: false, code: "PAGE_LIMIT" }
}

async function readEvents(
  options: TautulliHistoryOptions,
  filter: HistoryFilter,
  ctx: SourceContext,
  window?: TimeWindow
): Promise<SourceResult<PlayEvent[]>> {
  const result = await readHistory(options, filter, ctx)
  if (!result.ok) return result
  const excluded = new Set(options.excludedSectionIds)
  const events = result.data.flatMap((row) => {
    const event = toPlayEvent(row, excluded)
    return event && (!window || inWindow(event.startedAt, window)) ? [event] : []
  })
  return { ok: true, data: events }
}

/**
 * The Tautulli history source.
 *
 * @example
 * ```ts
 * const source = createTautulliHistorySource({ config, excludedSectionIds: ["7"] })
 * const plays = await source.fetchYear({ plexUserId: "123" }, yearWindow(2026, zone), { limiter: directLimiter })
 * if (!plays.ok) return plays.code // "TAUTULLI_ERROR", "TIMEOUT", "ROWS_INVALID", ...
 * ```
 */
export function createTautulliHistorySource(options: TautulliHistoryOptions): TautulliHistorySource {
  return {
    kind: "tautulli",
    fetchYear: (user, window, ctx) =>
      readEvents(options, { user_id: user.plexUserId, ...paddedDateRange(window) }, ctx, window),
    fetchServerYear: (window, ctx) => readEvents(options, paddedDateRange(window), ctx, window),
    fetchLifetime: (user, ctx) => readEvents(options, { user_id: user.plexUserId }, ctx),
  }
}
