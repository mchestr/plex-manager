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
 *    pages (`maxPages`; Discord's stats read at most 20). A flat-array
 *    response is one complete page. Each page goes through
 *    `ctx.limiter` with a 20 s budget.
 * 3. Validate each row, map it to a {@link PlayEvent}, drop the admin's
 *    excluded library sections, and trim to the window by instant.
 *
 * ## Excluded sections
 *
 * History rows carry no `section_id`, but `get_history` filters on one (a
 * comma-separated list). When the admin has excluded sections, the read first
 * pages the same filter with `section_id` set to them and keeps each row's
 * `reference_id`; the main pass then drops the rows with those ids. A play in
 * an excluded section is left out of the Rewind entirely, totals included,
 * as the library pass leaves out the section's titles (`readLibrary`).
 * Without exclusions there is no extra pass.
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
  /** The most pages one read may take before it fails with `PAGE_LIMIT` (default 200). */
  maxPages?: number
}

/** Plays by Tautulli `user_id` (the plex.tv account ID). */
type PlaysByUser = Map<string, PlayEvent[]>

export interface TautulliHistorySource extends WatchHistorySource {
  /**
   * Every user's plays in the window, for P2.6's server-wide aggregate. Each
   * page is folded into per-user buckets as it arrives.
   */
  fetchServerYear(window: TimeWindow, ctx: SourceContext): Promise<SourceResult<PlaysByUser>>
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
 * Map a validated row to a {@link PlayEvent}. Seconds become epoch ms;
 * minutes come from `play_duration`, never `viewed_duration` (which does not
 * exist).
 *
 * Exported for P2.10's fixture source and the tests.
 */
export function toPlayEvent(row: TautulliHistoryRow): PlayEvent {
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
    contentRating: null,
    live: row.live === 1,
  }
}

type HistoryFilter = { user_id?: string; after?: string; before?: string; section_id?: string }

/**
 * Every `get_history` row matching `filter`, validated. Each page's rows go
 * to `add` as the page arrives, so no caller has to hold the raw rows.
 */
async function readRows(
  options: TautulliHistoryOptions,
  filter: HistoryFilter,
  ctx: SourceContext,
  add: (row: TautulliHistoryRow) => void
): Promise<SourceResult<null>> {
  const tally: RowTally = { read: 0, dropped: 0 }
  let start = 0

  for (let page = 0; page < (options.maxPages ?? MAX_PAGES); page++) {
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
    for (const row of parseRows("tautulli get_history", tautulliHistoryRowSchema, raw, tally)) add(row)
    start += raw.length

    if (Array.isArray(data) || raw.length === 0 || start >= data.recordsFiltered) {
      return tooManyInvalid(tally) ? { ok: false, code: "ROWS_INVALID" } : { ok: true, data: null }
    }
  }
  return { ok: false, code: "PAGE_LIMIT" }
}

/** The `reference_id`s of the rows in the excluded sections; empty without exclusions. */
async function excludedReferences(
  options: TautulliHistoryOptions,
  filter: HistoryFilter,
  ctx: SourceContext
): Promise<SourceResult<Set<string>>> {
  const ids = new Set<string>()
  if (options.excludedSectionIds.length === 0) return { ok: true, data: ids }
  const result = await readRows(options, { ...filter, section_id: options.excludedSectionIds.join(",") }, ctx, (row) => {
    if (row.reference_id !== null) ids.add(row.reference_id)
  })
  return result.ok ? { ok: true, data: ids } : result
}

/**
 * Every play matching `filter` outside the excluded sections, trimmed to
 * `window` when given, each passed to `add` with its row. @internal
 */
async function readEvents(
  options: TautulliHistoryOptions,
  filter: HistoryFilter,
  ctx: SourceContext,
  window: TimeWindow | undefined,
  add: (event: PlayEvent, row: TautulliHistoryRow) => void
): Promise<SourceResult<null>> {
  const excluded = await excludedReferences(options, filter, ctx)
  if (!excluded.ok) return excluded
  return readRows(options, filter, ctx, (row) => {
    if (row.reference_id !== null && excluded.data.has(row.reference_id)) return
    const event = toPlayEvent(row)
    if (!window || inWindow(event.startedAt, window)) add(event, row)
  })
}

async function readEventList(
  options: TautulliHistoryOptions,
  filter: HistoryFilter,
  ctx: SourceContext,
  window?: TimeWindow
): Promise<SourceResult<PlayEvent[]>> {
  const events: PlayEvent[] = []
  const result = await readEvents(options, filter, ctx, window, (event) => events.push(event))
  return result.ok ? { ok: true, data: events } : result
}

async function readEventsByUser(
  options: TautulliHistoryOptions,
  window: TimeWindow,
  ctx: SourceContext
): Promise<SourceResult<PlaysByUser>> {
  const byUser: PlaysByUser = new Map()
  const result = await readEvents(options, paddedDateRange(window), ctx, window, (event, row) => {
    const userId = String(row.user_id)
    const bucket = byUser.get(userId)
    if (bucket) bucket.push(event)
    else byUser.set(userId, [event])
  })
  return result.ok ? { ok: true, data: byUser } : result
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
      readEventList(options, { user_id: user.plexUserId, ...paddedDateRange(window) }, ctx, window),
    fetchServerYear: (window, ctx) => readEventsByUser(options, window, ctx),
    fetchLifetime: (user, ctx) => readEventList(options, { user_id: user.plexUserId }, ctx),
  }
}
