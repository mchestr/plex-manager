/**
 * Row-by-row validation for the media cleanup reads (TS 7.2.3, 7.8). A copy of
 * `lib/wrapped/sources/rows.ts`, so cleanup stays out of Rewind's area.
 *
 * A row that fails its schema is dropped and counted, with a warning that
 * names the source and the failing field paths, never a value. Under
 * `NODE_ENV=test` it throws instead, so a fixture with a renamed field fails
 * loudly. A source whose dropped rows exceed 1 % of what it read fails as a
 * whole with `ROWS_INVALID` ({@link tooManyInvalid}), because missing rows
 * make items vanish. That share is for the Plex and arr lists (TS 7.2.3).
 * A row of a request or a play decides a fact of its title, so a lost one
 * would read as "no request" or "no play": those reads fail on one dropped
 * row that names a title ({@link namesTitle}, TS 7.8, UX 5.3 rule 1).
 *
 * @module lib/cleanup/snapshot/rows
 */

import type { z } from "zod"

import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("CLEANUP_SOURCES")

const MAX_INVALID_SHARE = 0.01

/** A paged read stops after this many pages with `PAGE_LIMIT` (TS 7.8). */
export const MAX_PAGES = 200

/** The codes a paged read adds to a `ServiceErrorCode` (TS 7.8). */
export type RowsFailureCode = "ROWS_INVALID" | "PAGE_LIMIT"

/**
 * What every cleanup read in `lib/connections` takes.
 *
 * - `signal`: the job's signal. A paged read also checks it between pages.
 * - `run`: wraps each upstream call, for example in `redisLimiter.run`
 *   (TS 7.2.1 item 2). These modules never call the limiter themselves.
 * - `timeoutMs`, `attempts`: override the TS 7.2.2 timeout and the 3
 *   `withRetry` attempts, for the act step's 60 s single tries (TS 8.9 step 3).
 */
export interface CleanupReadOptions {
  signal?: AbortSignal
  run?: <R>(call: () => Promise<R>) => Promise<R>
  timeoutMs?: number
  attempts?: number
}

/** Called with each page of parsed rows. Return `false` to stop paging. */
export type OnRows<T> = (rows: T[]) => void | boolean | Promise<void | boolean>

/** Run `call` through the caller's wrapper, or directly. */
export function runCall<R>(opts: CleanupReadOptions, call: () => Promise<R>): Promise<R> {
  return opts.run ? opts.run(call) : call()
}

/**
 * Thrown under `NODE_ENV=test` when a row fails its schema.
 * @internal
 */
export class SourceRowError extends Error {
  override name = "SourceRowError"
}

/** Rows read so far by one source call, and how many of them were dropped. */
export interface RowTally {
  read: number
  dropped: number
}

/** A fresh tally. */
export function newTally(): RowTally {
  return { read: 0, dropped: 0 }
}

/**
 * Parse `raw` with `schema`, keeping the rows that pass and adding to `tally`.
 * `onDropped` sees each raw row that failed, before the test-mode throw.
 */
export function parseRows<T>(source: string, schema: z.ZodType<T>, raw: readonly unknown[], tally: RowTally, onDropped?: (row: unknown) => void): T[] {
  const rows: T[] = []
  const issues = new Set<string>()
  for (const item of raw) {
    const parsed = schema.safeParse(item)
    if (parsed.success) {
      rows.push(parsed.data)
      continue
    }
    onDropped?.(item)
    for (const issue of parsed.error.issues) issues.add(issue.path.join(".") || "(root)")
  }

  const dropped = raw.length - rows.length
  tally.read += raw.length
  tally.dropped += dropped
  if (dropped > 0) {
    const paths = [...issues].slice(0, 10)
    if (process.env.NODE_ENV === "test") {
      throw new SourceRowError(`${source}: ${dropped} row(s) failed validation at ${paths.join(", ")}`)
    }
    logger.warn("Cleanup source rows failed validation", { source, dropped, issues: paths })
  }
  return rows
}

/** Whether more than 1 % of the rows a source read were dropped. */
export function tooManyInvalid(tally: RowTally): boolean {
  return tally.dropped > tally.read * MAX_INVALID_SHARE
}

const filled = (value: unknown) => (typeof value === "number" && value !== 0) || (typeof value === "string" && value.trim() !== "")

/**
 * Whether a raw row that failed its schema still names a title through one
 * of `fields` (a path of keys: `["media", "tmdbId"]`), so its loss could
 * change that title's facts. A row that names nothing changes no title.
 */
export function namesTitle(row: unknown, fields: readonly (readonly string[])[]): boolean {
  return fields.some((path) => {
    let at: unknown = row
    for (const key of path) at = at !== null && typeof at === "object" ? (at as Record<string, unknown>)[key] : undefined
    return filled(at)
  })
}
