/**
 * The one way to read a stored Rewind: `PlexWrapped.data` and `status`.
 *
 * ## Overview
 *
 * `PlexWrapped.data` holds JSON written by three generations of the
 * pipeline. {@link parseStoredRewind} reads its `version` and validates it with
 * the matching schema, so no v1, v2 or v3 row can crash a page or drift
 * silently (RWP-21):
 *
 * ```
 * JSON.parse ── fails ───────────────────────────► invalid ("not JSON")
 *     │
 *  object? ── no ────────────────────────────────► invalid
 *     │
 *  version ── absent or 1 ── schema-legacy ──────► { version: 1, legacy }
 *          ── 2 ──────────── schema-legacy ──────► { version: 2, legacy }
 *          ── 3 ──────────── schema-v3 (strict) ─► { version: 3, data }
 *          ── other ─────────────────────────────► invalid
 * ```
 *
 * It never throws and never logs: the result says what was wrong, and the
 * caller decides. A reason names schema paths only, never stored values.
 * {@link legacyWrappedData} wraps it for the v1/v2 viewer sites.
 *
 * ## Special cases
 *
 * - The legacy schema is lenient (see `./schema-legacy.ts`): any object
 *   without a `version` is a v1 row, so the `'{}'` placeholder written while
 *   a generation runs reads as an empty v1 Rewind. Its `status` is
 *   `generating`, so no viewer shows it.
 * - `PlexWrapped.dataVersion` is not consulted: v1 and v2 rows were never
 *   back-filled, so only the JSON's own `version` is reliable.
 * - Only the P0.20 strip transform reads `data` without this parser, because
 *   it must also rewrite rows that do not parse.
 *
 * @module lib/wrapped/data/parse-stored
 */

import { z } from "zod"

import { createLogger } from "@/lib/utils/logger"
import { storedWrappedDataSchema, type StoredWrappedData } from "@/lib/wrapped/data/schema-legacy"
import { RewindDataV3 } from "@/lib/wrapped/data/schema-v3"

const logger = createLogger("REWIND_DATA")

export type StoredRewind =
  | { version: 1; legacy: StoredWrappedData }
  | { version: 2; legacy: StoredWrappedData }
  | { version: 3; data: RewindDataV3 }
  | { version: "invalid"; reason: string }

/** The first few issues as `path: message`, without the values that failed. */
function describeIssues(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
    .join("; ")
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/**
 * Parse a stored `PlexWrapped.data` string into a typed, versioned result.
 *
 * @param data - The stored JSON string (null when the column is empty).
 * @returns The parsed row, or `{ version: "invalid", reason }`. Never throws.
 *
 * @example
 * ```ts
 * parseStoredRewind('{"version":2,"statistics":{"moviesWatched":3}}')
 * // { version: 2, legacy: { ..., statistics: { moviesWatched: 3, topMovies: [], ... } } }
 *
 * parseStoredRewind('{"version":9}')
 * // { version: "invalid", reason: "unknown version 9" }
 * ```
 */
export function parseStoredRewind(data: string | null): StoredRewind {
  if (data === null) return { version: "invalid", reason: "no data" }

  let json: unknown
  try {
    json = JSON.parse(data)
  } catch {
    return { version: "invalid", reason: "not JSON" }
  }
  if (!isRecord(json)) return { version: "invalid", reason: "not an object" }

  const version = json.version ?? 1
  if (version === 3) {
    const parsed = RewindDataV3.safeParse(json)
    return parsed.success ? { version: 3, data: parsed.data } : { version: "invalid", reason: `v3: ${describeIssues(parsed.error)}` }
  }
  if (version !== 1 && version !== 2) {
    return { version: "invalid", reason: `unknown version ${typeof version === "number" ? version : typeof version}` }
  }
  const parsed = storedWrappedDataSchema.safeParse(json)
  return parsed.success
    ? { version, legacy: parsed.data }
    : { version: "invalid", reason: `v${version}: ${describeIssues(parsed.error)}` }
}

/**
 * The v1 or v2 data the legacy viewer renders, or null for a v3 row (which
 * the legacy viewer cannot show) and for a row that does not parse. A null
 * logs a warning with the row id and the reason only.
 */
export function legacyWrappedData(row: { id: string; data: string | null }): StoredWrappedData | null {
  const stored = parseStoredRewind(row.data)
  if (stored.version === 1 || stored.version === 2) return stored.legacy
  logger.warn("Stored Rewind cannot be shown in the legacy viewer", {
    wrappedId: row.id,
    reason: stored.version === 3 ? "v3" : stored.reason,
  })
  return null
}

const wrappedStatusSchema = z.enum(["pending", "generating", "completed", "failed"])

export type WrappedStatus = z.infer<typeof wrappedStatusSchema>

/**
 * Read `PlexWrapped.status`. A value outside the four known states reads as
 * `failed`, with a warning that names only the row.
 *
 * @example
 * ```ts
 * readWrappedStatus("completed", "row-1") // "completed"
 * readWrappedStatus("queued", "row-1")    // "failed" (and logs a warning)
 * ```
 */
export function readWrappedStatus(raw: string, rowId?: string): WrappedStatus {
  const parsed = wrappedStatusSchema.safeParse(raw)
  if (parsed.success) return parsed.data
  logger.warn("Unknown Rewind status read as failed", { wrappedId: rowId ?? null })
  return "failed"
}
