import { type ArrPage } from "@/lib/connections/arr-client"
import { type ConnectionResult } from "@/types/connection"

/**
 * Tool output for the Sonarr and Radarr list tools (GAP-07): the records, the
 * server's total and a "showing N of M" line, so the assistant never presents
 * a capped list as the whole.
 *
 * Endpoints that cannot filter by series or movie (queue, calendar, wanted)
 * are filtered here by `filter.key` (`seriesId`, `movieId`, or a movie's own
 * `id`), so a question about one title never reports another's records.
 */

/** Keep only records whose `key` field is `id`. */
export interface ArrFilter {
  key: string
  id: number
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function matching(records: unknown[], filter: ArrFilter): unknown[] {
  return records.filter((record) => isRecord(record) && record[filter.key] === filter.id)
}

/** A paged or listed result as tool output, filtered to one title when `filter` is given. */
export function arrPageOutput(result: ConnectionResult<ArrPage>, filter?: ArrFilter): string {
  if (!result.success) return JSON.stringify({ error: result.error })
  const { records, totalRecords } = result.data
  if (!filter) {
    return JSON.stringify({ showing: `showing ${records.length} of ${totalRecords}`, totalRecords, records })
  }
  const found = matching(records, filter)
  return JSON.stringify({
    showing: `showing ${found.length} for this title, from the latest ${records.length} of ${totalRecords}`,
    totalRecords,
    records: found,
  })
}

/** An unpaged list (the calendar) as tool output, filtered to one title when `filter` is given. */
export function arrListOutput(result: ConnectionResult<unknown>, filter?: ArrFilter): string {
  if (!result.success) return JSON.stringify({ error: result.error })
  const records = Array.isArray(result.data) ? result.data : []
  return arrPageOutput({ success: true, data: { records, totalRecords: records.length } }, filter)
}

/**
 * The id of the first library item whose title or slug contains `name`
 * (case-insensitive), or `undefined`.
 */
export function idForTitle(library: unknown, name: string): number | undefined {
  if (!Array.isArray(library)) return undefined
  const needle = name.toLowerCase()
  const match = library.find(
    (item): item is Record<string, unknown> =>
      isRecord(item) &&
      typeof item.id === "number" &&
      [item.title, item.titleSlug].some((text) => typeof text === "string" && text.toLowerCase().includes(needle))
  )
  return typeof match?.id === "number" ? match.id : undefined
}
