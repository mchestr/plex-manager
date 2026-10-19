/**
 * Row-by-row validation for the Rewind sources (RWP-20).
 *
 * A row that fails its schema is dropped and counted, with a warning that
 * names the source and the failing field paths, never a value. Under
 * `NODE_ENV=test` it throws instead, so a fixture with a renamed field fails
 * loudly. A source whose dropped rows exceed 1% of what it read fails as a
 * whole ({@link tooManyInvalid}), because its totals would be wrong.
 *
 * @module lib/wrapped/sources/rows
 */

import type { z } from "zod"

import { createLogger } from "@/lib/utils/logger"

const logger = createLogger("REWIND_SOURCES")

const MAX_INVALID_SHARE = 0.01

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

/** Parse `raw` with `schema`, keeping the rows that pass and adding to `tally`. */
export function parseRows<T>(source: string, schema: z.ZodType<T>, raw: readonly unknown[], tally: RowTally): T[] {
  const rows: T[] = []
  const issues = new Set<string>()
  for (const item of raw) {
    const parsed = schema.safeParse(item)
    if (parsed.success) {
      rows.push(parsed.data)
      continue
    }
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
    logger.warn("Rewind source rows failed validation", { source, dropped, issues: paths })
  }
  return rows
}

/** Whether more than 1% of the rows a source read were dropped. */
export function tooManyInvalid(tally: RowTally): boolean {
  return tally.dropped > tally.read * MAX_INVALID_SHARE
}
