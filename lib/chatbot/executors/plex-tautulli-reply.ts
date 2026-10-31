import "server-only"

/**
 * Arguments, projections and reply sizing for the Plex and Tautulli tools.
 *
 * Arguments come from a model, so they are read defensively: a number may
 * arrive as text, out of range or not at all. Records are projected with
 * {@link pick}, an allowlist of fields. A reply holds at most
 * {@link REPLY_BUDGET} characters of records, so a tool result stays under the
 * 40,000 characters the MCP endpoint accepts, and its `showing` line says how
 * many it shows of how many and how to see the rest.
 *
 * @module
 */

/** Most characters of records one reply holds, leaving room under 40,000 for the rest of it. */
export const REPLY_BUDGET = 36_000

/** A projected record: only text, numbers and flags. */
export type Row = Record<string, string | number | boolean>

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

/** `value` as a list; anything else is an empty one. */
export function listOf(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/**
 * `record`'s `keys` that hold text, a number or a flag, in that order. Empty
 * text, objects, lists and every other key are left out, so a record of an
 * unexpected shape projects to less rather than failing.
 */
export function pick(record: unknown, keys: readonly string[]): Row {
  const row: Row = {}
  if (!isRecord(record)) return row
  for (const key of keys) {
    const value = record[key]
    if ((typeof value === "string" && value.trim() !== "") || typeof value === "number" || typeof value === "boolean") row[key] = value
  }
  return row
}

/** A whole number of at least 0, from a number or digits, or `undefined`. */
export function wholeNumber(value: unknown): number | undefined {
  const n = typeof value === "string" && /^\d+$/.test(value) ? Number(value) : value
  return typeof n === "number" && Number.isInteger(n) && n >= 0 ? n : undefined
}

/** The most pages a paged tool reads past: 100,000 pages of history is far beyond any server. */
export const MAX_PAGE = 100_000

function toNumber(value: unknown): number {
  if (typeof value === "number") return value
  return typeof value === "string" && /^\s*-?\d+(\.\d+)?\s*$/.test(value) ? Number(value) : Number.NaN
}

/** A count from 1 to `max` (clamped), or `fallback` when the argument is missing or not a number. */
export function countArg(value: unknown, fallback: number, max: number): number {
  const n = toNumber(value)
  return Number.isFinite(n) ? Math.min(Math.max(Math.trunc(n), 1), max) : fallback
}

/** Trimmed text of at most 100 characters, or `undefined` when blank or not text. */
export function textArg(value: unknown): string | undefined {
  const text = typeof value === "string" ? value.trim().slice(0, 100) : ""
  return text === "" ? undefined : text
}

/**
 * A Tautulli user id (the plex.tv account id): `undefined` when none was
 * given, `null` when the argument is not a whole number (a name passed by
 * mistake), so the tool refuses it instead of answering for every user.
 */
export function userIdArg(value: unknown): number | null | undefined {
  if (value === undefined || value === null || value === "") return undefined
  const n = toNumber(value)
  return Number.isInteger(n) && n >= 0 ? n : null
}

/** The longest start of `records` whose JSON fits in `budget` characters. */
export function withinBudget<T>(records: readonly T[], budget = REPLY_BUDGET): T[] {
  let used = 2
  for (let index = 0; index < records.length; index++) {
    used += JSON.stringify(records[index]).length + 1
    if (used > budget) return records.slice(0, index)
  }
  return [...records]
}

/** Whether `needle` occurs in any of `fields` that is text, ignoring case. */
export function containsText(needle: string, ...fields: unknown[]): boolean {
  const lower = needle.toLowerCase()
  return fields.some((field) => typeof field === "string" && field.toLowerCase().includes(lower))
}

/** `line`, followed by how to see the rest when the reply does not show everything. */
export function showing(line: string, capped: boolean, more: string): string {
  return capped ? `${line}; ${more}` : line
}
