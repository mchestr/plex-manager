/**
 * The contract between the Rewind sources and the stats engine (design 7.3).
 *
 * Every stat module consumes {@link PlayEvent}s, never upstream rows, and
 * decides "counted" and "finished" with the two rules exported here and
 * nowhere else (RWP-07).
 *
 * Sources never throw for an upstream failure: they return a
 * {@link SourceResult} whose `code` says what went wrong, and never carry
 * upstream text that could hold a key or another member's details.
 *
 * @module lib/wrapped/sources/watch-history-source
 */

import type { ServiceErrorCode } from "@/lib/connections/http"
import type { TimeWindow } from "@/lib/wrapped/time/zone"

/** One play, as every Rewind stat module reads it. Instants are epoch ms. */
export interface PlayEvent {
  ratingKey: string
  grandparentRatingKey: string | null
  parentMediaIndex: number | null
  mediaIndex: number | null
  mediaType: "movie" | "episode" | "track" | "other"
  title: string
  grandparentTitle: string | null
  year: number | null
  originallyAvailableAt: string | null
  startedAt: number
  stoppedAt: number
  playSeconds: number
  pausedSeconds: number
  percentComplete: number
  /** 0 to 1; Tautulli reports 0, 0.25, 0.5, 0.75 and 1. */
  watchedStatus: number
  transcodeDecision: "direct play" | "copy" | "transcode" | null
  location: "lan" | "wan" | null
  platform: string | null
  product: string | null
  guid: string | null
  librarySectionId: string
  /** History rows carry none; P2.6's `getMemberEvents()` fills it from the library pass. */
  contentRating: string | null
  live: boolean
  /**
   * Set by P2.6's content-rating exclusions (FR-44): the play counts toward
   * totals but never reaches a list, a record, a calendar day's top title or
   * a card.
   */
  excludedFromLists?: boolean
}

/** The upstream services whose calls a {@link UpstreamLimiter} admits. */
export type UpstreamService = "tautulli" | "overseerr" | "plex"

/**
 * Admits one upstream call at a time into a per-service concurrency cap.
 * P2.5's `redisLimiter` implements it with a Redis semaphore shared by every
 * process; {@link directLimiter} runs the call straight away.
 *
 * `options.signal` bounds the wait for a slot: once it aborts, a waiting call
 * rejects instead of running.
 */
export interface UpstreamLimiter {
  run<T>(service: UpstreamService, fn: () => Promise<T>, options?: { signal?: AbortSignal }): Promise<T>
}

/**
 * No cap: runs every call at once. The default outside the queue workers.
 * @public
 */
export const directLimiter: UpstreamLimiter = {
  run: (_service, fn) => fn(),
}

/** What every source call needs besides its own arguments. */
export interface SourceContext {
  signal?: AbortSignal
  limiter: UpstreamLimiter
}

/**
 * Why a source failed: the HTTP client's codes, Tautulli's error result,
 * more than 1% of rows failing their schema, or the page cap being hit
 * (a partial read is never returned).
 */
type SourceErrorCode = ServiceErrorCode | "TAUTULLI_ERROR" | "ROWS_INVALID" | "PAGE_LIMIT"

export type SourceResult<T> = { ok: true; data: T } | { ok: false; code: SourceErrorCode; status?: number }

/**
 * Run one upstream call through `ctx.limiter`. A limiter that rejects because
 * the caller's signal aborted while waiting gives `ABORTED`.
 */
export async function runLimited<R>(
  ctx: SourceContext,
  service: UpstreamService,
  fn: () => Promise<R>
): Promise<R | { ok: false; code: "ABORTED" }> {
  try {
    return await ctx.limiter.run(service, fn, { signal: ctx.signal })
  } catch (error) {
    if (ctx.signal?.aborted) return { ok: false, code: "ABORTED" }
    throw error
  }
}

/** The member a history source reads: Tautulli's `user_id` is the plex.tv account ID. */
export interface RewindUser {
  plexUserId: string
}

/** A history backend. For 2026 only Tautulli exists; Jellyfin is a 2027 item. */
export interface WatchHistorySource {
  readonly kind: "tautulli" | "jellyfin-playback-reporting"
  fetchYear(user: RewindUser, window: TimeWindow, ctx: SourceContext): Promise<SourceResult<PlayEvent[]>>
}

/**
 * Whether a play counts toward "watched" lists and play counts (FR-46): at
 * least two minutes played, or 90% reached. Every minute counts toward totals
 * either way.
 *
 * @example
 * ```ts
 * isCountedPlay({ playSeconds: 70, percentComplete: 95 })  // true
 * isCountedPlay({ playSeconds: 100, percentComplete: 40 }) // false
 * isCountedPlay({ playSeconds: 120, percentComplete: 0 })  // true
 * ```
 */
export function isCountedPlay(e: Pick<PlayEvent, "playSeconds" | "percentComplete">): boolean {
  return e.playSeconds >= 120 || e.percentComplete >= 90
}

/**
 * Whether a play finished its title: Tautulli marked it watched, or it
 * reached 90%.
 *
 * @example
 * ```ts
 * isFinished({ watchedStatus: 1, percentComplete: 50 })    // true
 * isFinished({ watchedStatus: 0.75, percentComplete: 89 }) // false
 * ```
 *
 * @public The stats modules (P2.7, P2.8) read it.
 */
export function isFinished(e: Pick<PlayEvent, "watchedStatus" | "percentComplete">): boolean {
  return e.watchedStatus >= 1 || e.percentComplete >= 90
}
