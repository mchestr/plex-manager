/**
 * Which `LLMUsage` row produced the Rewind a `PlexWrapped` row holds now.
 *
 * Generation records the usage row when the model answers and sets
 * `PlexWrapped.generatedAt` after it stores the result, so the current
 * version is the newest usage row created at or before `generatedAt`. A
 * later row is a regeneration that failed or is still running. This replaces
 * comparing `sections`, which only v1 rows have (the v2 history regression).
 *
 * @module lib/wrapped/data/history
 */

/**
 * The id of the usage row behind the stored Rewind, or null when there is
 * none (the row was never generated, or every usage row is newer).
 *
 * @example
 * ```ts
 * pickCurrentUsageId(
 *   [
 *     { id: "retry", createdAt: new Date("2026-12-02T10:00:00Z") },
 *     { id: "first", createdAt: new Date("2026-12-01T10:00:00Z") },
 *   ],
 *   new Date("2026-12-01T10:00:05Z")
 * ) // "first"
 * ```
 */
export function pickCurrentUsageId(
  records: ReadonlyArray<{ id: string; createdAt: Date }>,
  generatedAt: Date | null
): string | null {
  if (!generatedAt) return null
  let current: { id: string; createdAt: Date } | null = null
  for (const record of records) {
    if (record.createdAt <= generatedAt && (!current || record.createdAt > current.createdAt)) {
      current = record
    }
  }
  return current?.id ?? null
}
