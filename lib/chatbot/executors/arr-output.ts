import "server-only"

import { type z } from "zod"

import { type ArrPage } from "@/lib/connections/arr-client"
import { MAX_RESULT_CHARS } from "@/lib/utils/tool-result-limit"
import { type ConnectionResult } from "@/types/connection"

/**
 * Tool output for the Sonarr and Radarr list tools (GAP-07): the records, the
 * total and a "showing N of M" line, so the assistant never presents a capped
 * list as the whole, followed by how to see the rest when not all are shown.
 *
 * Each record is projected to the fields an answer needs, and a reply holds at
 * most the tool's count and at most {@link ARR_REPLY_BUDGET} characters of
 * records: a tool result must stay under 40,000 characters (the MCP limit),
 * with room for the zone offsets the dispatcher adds to every time.
 *
 * Endpoints that cannot filter by series or movie (queue, calendar, wanted)
 * are filtered here by `filter.key` (`seriesId`, `movieId`, or a movie's own
 * `id`) and, for one season of a series, `filter.season`, so a question about
 * one title never reports another's records.
 *
 * @module
 */

/** Keep only records whose `key` field is `id` and, given a `season`, whose season (their own, or their episode's) is it. */
export interface ArrFilter {
  key: string
  id: number
  season?: number
}

/** How a reply is cut: each record's projection, the most records it holds, and what to pass to see more. */
interface ArrCut<T> {
  project: z.ZodType<T>
  limit: number
  /** What to pass to see more, given when the reply does not show every record. */
  more?: string
  /** With a filter, give `more` too when the records read stop short of the server's total, since matches may lie past them. */
  morePastRead?: boolean
}

/** Most characters of records in one reply. */
const ARR_REPLY_BUDGET = MAX_RESULT_CHARS - 4_000

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function seasonOf(record: Record<string, unknown>): unknown {
  return record.seasonNumber ?? (isRecord(record.episode) ? record.episode.seasonNumber : undefined)
}

function matching(records: unknown[], { key, id, season }: ArrFilter): unknown[] {
  return records.filter((record) => isRecord(record) && record[key] === id && (season === undefined || seasonOf(record) === season))
}

/** `value` as a list of records; anything else is none. */
export function asList(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** Each record that parses, projected; a record that is not an object is skipped. */
export function projectEach<T>(records: readonly unknown[], schema: z.ZodType<T>): T[] {
  return records.flatMap((record) => {
    const parsed = schema.safeParse(record)
    return parsed.success ? [parsed.data] : []
  })
}

/** The longest start of `records` whose JSON fits in {@link ARR_REPLY_BUDGET}. */
function withinBudget<T>(records: T[]): T[] {
  let used = 2
  for (let index = 0; index < records.length; index++) {
    used += JSON.stringify(records[index]).length + 1
    if (used > ARR_REPLY_BUDGET) return records.slice(0, index)
  }
  return records
}

function cut<T>(records: unknown[], { project, limit }: ArrCut<T>): T[] {
  return withinBudget(projectEach(records, project).slice(0, limit))
}

/** `line`, and `more` after it when the reply does not show every record. */
function showing(line: string, capped: boolean, more: string | undefined): string {
  return capped && more ? `${line}; ${more}` : line
}

/** The ways to see more that apply, as one hint: "pass a pageSize up to 50, or pass a series". */
export function orElse(...ways: (string | false | undefined)[]): string | undefined {
  const kept = ways.filter((way) => typeof way === "string" && way !== "")
  return kept.length > 0 ? kept.join(", or ") : undefined
}

/** How many a filtered reply shows: all `found`, or "N of the M". */
function countOf(shown: number, found: number): string {
  return shown === found ? `${found}` : `${shown} of the ${found}`
}

/** A paged result as tool output, filtered to one title when `filter` is given. */
export function arrPageOutput<T>(result: ConnectionResult<ArrPage>, reply: ArrCut<T>, filter?: ArrFilter): string {
  if (!result.success) return JSON.stringify({ error: result.error })
  const { records: read, totalRecords } = result.data
  const found = filter ? matching(read, filter) : read
  const records = cut(found, reply)
  const line = filter
    ? `showing ${countOf(records.length, found.length)} for this title, from the latest ${read.length} of ${totalRecords}`
    : `showing ${records.length} of ${totalRecords}`
  const short = records.length < (filter ? found.length : totalRecords) || (filter !== undefined && reply.morePastRead === true && read.length < totalRecords)
  return JSON.stringify({ showing: showing(line, short, reply.more), totalRecords, records })
}

/** An unpaged list (the calendar) as tool output, filtered to one title when `filter` is given. */
export function arrListOutput<T>(result: ConnectionResult<unknown>, reply: ArrCut<T>, filter?: ArrFilter): string {
  if (!result.success) return JSON.stringify({ error: result.error })
  const all = asList(result.data)
  const found = filter ? matching(all, filter) : all
  const records = cut(found, reply)
  const line = filter
    ? `showing ${countOf(records.length, found.length)} for this title, from the ${all.length} in the date range`
    : `showing ${records.length} of ${all.length}`
  return JSON.stringify({ showing: showing(line, records.length < found.length, reply.more), totalRecords: all.length, records })
}

/** Lookup results a search reply holds. */
const ARR_SEARCH_LIMIT = 10

/** A lookup's first {@link ARR_SEARCH_LIMIT} results, with how many it found and how to find one exactly (`exact`). */
export function arrSearchOutput<T>(results: T[], term: string, exact: string): string {
  const records = results.slice(0, ARR_SEARCH_LIMIT)
  const line = `showing ${records.length} of ${results.length} results for "${term}"`
  return JSON.stringify({ showing: showing(line, records.length < results.length, `use a more specific term, or ${exact}`), totalRecords: results.length, records })
}

/** One page of a list the tool sorted itself (a library, a series' episodes). */
interface ArrLocalPage<T> {
  items: T[]
  page: number
  pageSize: number
  /** What the items are, after the count: "series, sorted by title". */
  what: string
  /** What else narrows the list, offered after the next page. */
  more?: string
}

/** The "showing" line, total and records of one page of `items`. */
export function arrLocalPage<T>({ items, page, pageSize, what, more }: ArrLocalPage<T>) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize))
  const slice = items.slice((page - 1) * pageSize, page * pageSize)
  const records = withinBudget(slice)
  const where = pages > 1 || page > 1 ? ` (page ${page} of ${pages})` : ""
  const next =
    page > pages
      ? `pass a page from 1 to ${pages}`
      : records.length < slice.length
        ? `only ${records.length} of this page fit in one reply: pass a smaller pageSize`
        : page < pages
          ? orElse(`pass page ${page + 1} for the next ${pageSize}`, more)
          : more
  const line = `showing ${records.length} of ${items.length} ${what}${where}`
  return { showing: showing(line, records.length < items.length, next), totalRecords: items.length, records }
}

/** True when `title` contains `search`, ignoring case and punctuation ("agents of shield" finds "Agents of S.H.I.E.L.D."). */
export function titleMatches(title: string | undefined, search: string): boolean {
  if (title === undefined) return false
  const bare = (value: string) => value.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, "")
  return title.toLowerCase().includes(search.toLowerCase()) || (bare(search) !== "" && bare(title).includes(bare(search)))
}

/** `items` sorted by title, ignoring case. */
export function byTitle<T extends { title?: string }>(items: T[]): T[] {
  return [...items].sort((a, b) => (a.title ?? "").localeCompare(b.title ?? "", "en", { sensitivity: "base", numeric: true }))
}

/**
 * The id of the library item whose title is `name` (case-insensitive), or
 * else the first whose title or slug contains it, or `undefined`. An exact
 * title wins, so "The Office" never picks "The Office Christmas Special".
 */
export function idForTitle(library: unknown, name: string): number | undefined {
  const needle = name.trim().toLowerCase()
  if (needle === "") return undefined
  const items = asList(library).filter((item): item is Record<string, unknown> => isRecord(item) && typeof item.id === "number")
  const exact = items.find((item) => typeof item.title === "string" && item.title.toLowerCase() === needle)
  const match =
    exact ?? items.find((item) => [item.title, item.titleSlug].some((value) => typeof value === "string" && value.toLowerCase().includes(needle)))
  return typeof match?.id === "number" ? match.id : undefined
}
