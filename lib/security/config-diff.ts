/**
 * A redacted diff of a configuration change, for `CONFIG_CHANGED` audit rows.
 *
 * ## Overview
 *
 * The audit trail must say what changed without becoming a second copy of the
 * secrets it describes. The diff therefore carries:
 *
 * - `changedFields`: the names of the non-secret fields whose value changed;
 * - `secretChanged`: one boolean for all secret fields, never a value;
 * - `origins`: each URL field as its origin only (`https://host:port`), with no
 *   path, query or credentials.
 *
 * Field values themselves are never copied, so the diff is safe to persist
 * whatever the section holds.
 *
 * ## Special cases
 *
 * - `before` is null for a first save: every field of `after` counts as changed.
 * - A secret field that is `undefined` in `after` was left blank and kept, so it
 *   counts as unchanged.
 *
 * @example
 * ```ts
 * configDiff(
 *   "tautulli",
 *   { url: "http://old.lan:8181/x", apiKey: "k1" },
 *   { url: "https://new.lan/y?z=1", apiKey: "k1" },
 *   { secretFields: ["apiKey"], urlFields: ["url"] },
 * )
 * // { section: "tautulli", changedFields: ["url"], secretChanged: false,
 * //   origins: { before: { url: "http://old.lan:8181" }, after: { url: "https://new.lan" } } }
 * ```
 *
 * @module lib/security/config-diff
 */

type Fields = Record<string, unknown>

export type ConfigDiff = {
  section: string
  changedFields: string[]
  secretChanged: boolean
  origins: { before: Record<string, string | null> | null; after: Record<string, string | null> }
}

interface DiffOptions {
  secretFields?: readonly string[]
  urlFields?: readonly string[]
}

function originOf(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null
  try {
    const { origin } = new URL(value)
    return origin === "null" ? null : origin
  } catch {
    return null
  }
}

function comparable(value: unknown): string {
  return JSON.stringify(value ?? null)
}

function originsOf(fields: Fields, urlFields: readonly string[]): Record<string, string | null> {
  return Object.fromEntries(urlFields.filter((field) => field in fields).map((field) => [field, originOf(fields[field])]))
}

/** The redacted diff between two states of one settings section. */
export function configDiff(
  section: string,
  before: Fields | null,
  after: Fields,
  { secretFields = [], urlFields = [] }: DiffOptions = {}
): ConfigDiff {
  const keys = new Set([...Object.keys(before ?? {}), ...Object.keys(after)])
  const changedFields = [...keys]
    .filter((key) => !secretFields.includes(key))
    .filter((key) => !before || comparable(before[key]) !== comparable(after[key]))
    .sort()

  const secretChanged = secretFields.some(
    (field) => after[field] !== undefined && (!before || comparable(before[field]) !== comparable(after[field]))
  )

  return {
    section,
    changedFields,
    secretChanged,
    origins: { before: before ? originsOf(before, urlFields) : null, after: originsOf(after, urlFields) },
  }
}
